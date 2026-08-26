# Phase 19: El panel - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** 8 (1 crear · 6 modificar · 1 regenerar)
**Analogs found:** 8 / 8 (1 de ellos con match parcial declarado — ver §No Analog Found)

> Fuente del listado de archivos: `19-RESEARCH.md` §Component Responsibilities + `19-UI-SPEC.md`
> §Alcance de la superficie. Nada fuera de esa lista entra en la fase.

---

## File Classification

| Archivo nuevo/modificado | Rol | Data flow | Analog más cercano | Match |
|---|---|---|---|---|
| `supabase/migrations/074_save_agenda_blocks.sql` | migration (función RPC transaccional) | batch write / todo-o-nada | **cuerpo:** `supabase/schema.sql:213-528` (`book_slot_atomic`, última versión = migr. 070) · **grants:** `supabase/migrations/072_public_views_read_only.sql:72-90` · **cabecera/runbook:** `supabase/migrations/071_time_block_services.sql:1-75` | role-match (ver §Divergencia obligada) |
| `supabase/schema.sql` | schema dump | — | regeneración post-migración (patrón repo: 042/057/059/071) | exact |
| `lib/time-block-services.ts` (extender) | pure lib | transform | el propio módulo (`blocksForService` :~85, `isServiceScheduled` :~110) + `lib/agenda-occupancy.ts` como molde de "módulo puro + suite" | exact |
| `test/time-block-services.test.ts` (extender) | test (puro, vitest) | transform | el propio archivo `:1-70` (cabecera + factories `block()` / `map()` + estándar de CONTROL NEGATIVO) | exact |
| `app/(dashboard)/agenda/page.tsx` | RSC / read path | request-response | el propio `Promise.all` `:28-56` + `app/(dashboard)/servicios/page.tsx:22` (catálogo con `order('created_at')`) + `app/api/booking/availability/route.ts:167-170` (shape de la puente) | exact |
| `app/(dashboard)/agenda/agenda-client.tsx` | client component + write path | CRUD (diff) / RPC | **UI del chip:** `components/crm/tag-chip.tsx:42-64` + `settings-client.tsx:2776-2793` · **helper fuera del componente:** `OccupancyBadge` `agenda-client.tsx:110-141` · **write con RPC:** `lib/booking-core.ts:499-514` · **mapeo de error:** `settings-client.tsx:1280-1297` | exact |
| `app/(dashboard)/settings/settings-client.tsx` | client component (pre-check + copy) | request-response | `openDeleteService` `:1167-1225` (el `Promise.all` de counts + fail-closed) y `delDescription` `:1233-1247` | exact |
| `app/[slug]/booking-client.tsx` | client component público | request-response | la rama `any_professional_unsupported` `:397-403` | exact |

---

## Pattern Assignments

### 1. `supabase/migrations/074_save_agenda_blocks.sql` (migration · RPC atómico)

**Analogs:** cuerpo de función → `supabase/schema.sql:213-528` · grants → `072:72-90` · cabecera y runbook → `071:1-75`.

#### 1a. Firma + cabecera de función (molde `book_slot_atomic`)

```sql
-- Source: supabase/schema.sql:213-217
CREATE OR REPLACE FUNCTION "public"."book_slot_atomic"("p_business_id" "uuid", ... ) RETURNS TABLE("id" "uuid", "cancel_token" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  -- (068) modo de cupo del SERVICIO, de TRES valores: ...
  v_mode text;
BEGIN
```

**Qué se copia:** el quoting de identificadores (`"public"."nombre"`, `"p_x" uuid`), `LANGUAGE "plpgsql"`,
`SET "search_path" TO 'public'` (obligatorio), `RETURNS TABLE(...)`, el bloque `DECLARE` con **un
comentario por variable** citando la migración/decisión que la introdujo, y el `CREATE OR REPLACE`
(idempotencia, regla del `supabase/migrations/README.md`).

**⚠ Qué NO se copia (divergencia obligada, RESEARCH §Pattern 1 + P-02):**
- `SECURITY DEFINER` → la 074 va **`SECURITY INVOKER`** (el default; se puede escribir explícito). Con
  DEFINER se crearía una segunda RA-05 sobre la configuración del negocio.
- El `GRANT EXECUTE ... TO "anon"` que arrastran las redefiniciones de `book_slot_atomic`
  (`041:183`, `042:244`, `058:230`, `062:391`, `063:372`, `064:482`, `068:767`, `069:489` — todas
  idénticas). **Ese es exactamente el molde a NO copiar.**
- El comentario `-- business_id EXPLÍCITO: adentro de un SECURITY DEFINER la RLS no aplica`
  (`schema.sql:246-248`) se invierte: acá la RLS **sí** aplica y el `p_business_id` explícito es la
  segunda capa, no la única defensa.

#### 1b. `RAISE` con código de dominio

```sql
-- Source: supabase/schema.sql:582 / :587 (services_block_delete)
RAISE EXCEPTION 'service_has_future_appointments' USING ERRCODE = 'P0001';
```

Mismo formato para el guard de autoría: `RAISE EXCEPTION 'not_your_business' USING ERRCODE = 'P0001';`.
El nombre del error es un **código de dominio en snake_case**, no una frase para el usuario — el cliente
lo detecta con `message.includes(...)` (ver §2c) y pone su propia copy.

#### 1c. REVOKE / GRANT — **no hay precedente exacto sobre FUNCTIONS en el repo**

Verificado: `grep -rn "ON FUNCTION" supabase/migrations/*.sql` (excluyendo el baseline) devuelve
**solo `GRANT EXECUTE ... TO "anon","authenticated","service_role"`** sobre `book_slot_atomic`. **Ninguna
migración del repo revoca EXECUTE de una función.** El planner debe usar la **forma** del molde de
privilegios más cercano, que es sobre vistas:

```sql
-- Source: supabase/migrations/072_public_views_read_only.sql:72-75
REVOKE ALL ON TABLE "public"."public_businesses" FROM "anon";
REVOKE ALL ON TABLE "public"."public_businesses" FROM "authenticated";
GRANT SELECT ON TABLE "public"."public_businesses" TO "anon";
GRANT SELECT ON TABLE "public"."public_businesses" TO "authenticated";
```

Traducido a la 074 (firma completa y comillada, como en los `GRANT EXECUTE` existentes):

```sql
REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") FROM "anon";
GRANT  EXECUTE ON FUNCTION "public"."save_agenda_blocks"("uuid", "jsonb") TO "authenticated";
```

Complemento de estilo para el bloque de privilegios (comentario + verificación posterior en la
cabecera) — molde `072:63-70`:

```sql
-- Verificación posterior (debe devolver solo `SELECT` para anon y authenticated):
--   SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants ...
```

Para la 074 el equivalente es `SELECT proacl FROM pg_proc WHERE proname='save_agenda_blocks';`
(RESEARCH P-02). Y el `ALTER DEFAULT PRIVILEGES ... REVOKE ...` de `073:91-100` es el molde si el
planner decide además cerrar el default de FUNCTIONS del baseline (`baseline.sql:3081`) — **incluido
el `DO $$ ... EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE` de `073:94-101`**, que es cómo
este repo degrada un ALTER que puede no tener permiso en vez de abortar la migración.

#### 1d. Cabecera y runbook de la migración

`071:1-75` es el nivel esperado: título de una línea (`-- 074 — <qué hace> (motor-reservas / Phase 19 —
AGENDA-05/06, v0.28)`), `Contexto`, `Qué hace` numerado, `⚠ divergencias` explícitas, `Qué NO hace
(invariantes del proyecto)`. Y el runbook de aplicación manual + `NOTIFY pgrst, 'reload schema';`
(P-05) sale de la misma cabecera (`071:68-75`).

---

### 2. `app/(dashboard)/agenda/agenda-client.tsx` (client component · el grueso)

#### 2a. Helper de presentación **fuera** del componente (UI-SPEC riesgo #1)

```tsx
// Source: app/(dashboard)/agenda/agenda-client.tsx:110-141 (OccupancyBadge)
function OccupancyBadge({ occupied, capacity, pendingDeposit, scope, className }: {
  occupied: number
  capacity: number
  /** 'slot' = el cupo de este horario (grupal) · 'overlap' = turnos que se PISAN (simultáneo). */
  scope: 'slot' | 'overlap'
  className?: string
}) {
  ...
  return (
    <Badge variant="outline" title={title} className={cn('h-4 gap-0.5 px-1 py-0 text-[9px] font-medium', ..., className)}>
```

`ServiceChip` y `BlockServicesLine` van **exactamente ahí**: mismo archivo, definidas antes de
`AgendaClient`, props tipadas inline, JSDoc `/** */` en la prop no obvia, `cn()` con clases base +
condicionales + `className` al final.

#### 2b. El chip toggleable (44px táctil + pill visual)

```tsx
// Source: components/crm/tag-chip.tsx:42-64
// Variante toggle: botón con aria-pressed. min-h-11 (44px) garantiza el touch target aunque el pill
// visual sea más bajo; focus-visible deja el ring accesible (CLAUDE.md: estado focus visible).
<button
  type="button"
  aria-pressed={selected}
  onClick={onToggle}
  className={cn('inline-flex min-h-11 items-center outline-none', 'focus-visible:ring-ring/50 rounded-4xl focus-visible:ring-2', className)}
>
  <span className={cn(pillBase, selected ? 'border-border bg-secondary text-foreground' : 'border-border bg-transparent text-muted-foreground')}>
```

Es el analog **primario** (estructura botón-externo/pill-interno + tokens neutros = lo que fijó el
UI-SPEC). El segundo analog es el chip de `/equipo`:

```tsx
// Source: app/(dashboard)/settings/settings-client.tsx:2776-2793
<div role="group" aria-label={`${term.services} de ${fullName}`} className="flex flex-wrap gap-2">
  {services.map(s => (
    <button key={s.id} type="button" onClick={() => toggleProfessionalService(p.id, s.id)} aria-pressed={checked}
      className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary hover:text-primary')}>
      {checked && <Check aria-hidden="true" className="w-3.5 h-3.5" />}
      {s.name}
    </button>
  ))}
</div>
```

**De acá se copia:** el `role="group"` + `aria-label` interpolando `term.services`, `flex flex-wrap`,
el `{checked && <Check aria-hidden="true" .../>}`, y el patrón de estado comodín inline
(`{isWildcard && <span …>Hace todo</span>}`, `:2769`) que evita layout shift.
**De acá NO se copia:** el color (`border-primary bg-primary/10 text-primary` falla AA en 3 de 5
paletas — UI-SPEC §Color, deuda anotada de `/equipo`) ni la escritura inmediata (`toggleProfessionalService`
persiste al instante; acá D-03 manda "editá y después guardá").

#### 2c. Invocación del RPC + mapeo de rechazos

```ts
// Source: lib/booking-core.ts:499-514 — la única invocación de .rpc() del repo
.rpc('book_slot_atomic', {
  p_business_id: business.id,
  p_service_id: service.id,
  p_date: date,
  ...
})
```

```ts
// Source: app/(dashboard)/settings/settings-client.tsx:1282-1292 (deleteService)
if (error) {
  // Mapeo del rechazo del gate de la migr. 065 (molde: lib/booking-core.ts — message primero,
  // code después). Dos messages distintos sobre el mismo ERRCODE P0001 para poder distinguir...
  if (error.code === 'P0001' && error.message?.includes('service_has_future_appointments')) return { ok: false, error: 'has_future_appointments' }
  if (error.code === 'P0001' && error.message?.includes('service_has_active_abono')) return { ok: false, error: 'has_active_abono' }
  if (error.code === '23503') return { ok: false, error: 'has_future_appointments' }
  return { ok: false, error: 'unknown' }
}
```

**Regla dura que este molde encierra:** el `error.message` se **inspecciona**, nunca se **muestra**
(T-14-25 / T-13-09). El resultado es un código de dominio snake_case y la copy la pone el call site.
Tabla de rechazos → copy en `19-RESEARCH.md` §Pattern 2.

#### 2d. Write path del panel: aislamiento por tenant

```ts
// Source: app/(dashboard)/settings/settings-client.tsx:1744-1749 (toggleProfessionalService)
// "Escritura por el browser client con RLS + .eq('business_id') (defensa en profundidad),
//  NUNCA service-role"
const { error } = await supabase
  .from('professional_services')
  .delete()
  .eq('business_id', business.id)      // ← defensa en profundidad; la RLS ya acota
  .eq('professional_id', professionalId)
  .eq('service_id', serviceId)
```

Traslado al RPC: `p_business_id` es parámetro y **todos** los `WHERE`/`INSERT` del cuerpo lo llevan
(RESEARCH §Aislamiento por tenant, tabla de capas).

#### 2e. El código que se reescribe (contexto exacto para el diff)

- `LocalBlock` / `defaultBlock` `:172-180` — gana `service_ids: string[]`, **pierde** `capacity` (D-12).
- `dayStates` `:254-262` — el `useState(initializer)` que **nunca re-sincroniza** (P-01). Acá entra
  `service_ids: servicesOfBlock(b.id, initialTimeBlockServices)`.
- Mutadores `toggleDay :270`, `addBlock :283`, `removeBlock :296`, `updateBlock :306` — todos siguen el
  molde `setDayStates(prev => { const next = [...prev]; ... return next })`. Los seis prenden `hoursDirty`.
- `applyCopyDay :347-364` — la línea a tocar es
  `const copied = src.map(b => ({ start_time: b.start_time, ..., capacity: b.capacity }))` `:358`:
  se saca `capacity`, entra `service_ids: [...b.service_ids]` (P-04: **clonar**, no compartir la ref).
- `saveHours :366-390` — se reemplaza entera (delete-all + insert → un `.rpc()` + reconciliación de ids).
- JSX de la fila `:920-982`; stepper a borrar `:941-968`; `block.error` `:977-979` (la línea nueva va
  **después**, P-09); botón Guardar `:1002-1006` (al lado va `Cambios sin guardar`).
- `Minus` (`:20`) **NO se puede desimportar**: tiene un segundo uso en `:1038` (P-06, verificado).

---

### 3. `lib/time-block-services.ts` (pure lib, extender)

**Analog: el propio módulo.** Molde de función pura exportada, con el JSDoc que explica el POR QUÉ y
el caso trampa:

```ts
// Source: lib/time-block-services.ts (blocksForService)
/**
 * Las franjas donde se da `serviceId`.
 *
 * Comodín (D-01): una franja sin ninguna fila en `bridge` entra siempre (sirve para cualquier
 * servicio); una franja con ≥1 fila entra sólo si alguna de SUS filas es de ese servicio. ...
 */
export function blocksForService<T extends { id: string }>(
  serviceId: string, blocks: T[], bridge: TimeBlockService[],
): T[] {
  return blocks.filter((b) => {
    const rows = bridge.filter((r) => r.time_block_id === b.id)
    if (rows.length === 0) return true // comodín: la franja sirve para todo
    return rows.some((r) => r.service_id === serviceId)
  })
}
```

Reglas del módulo que las dos funciones nuevas heredan **sin excepción** (cabecera `:1-30`):
sin React, sin Supabase, sin `next/`; entradas = filas planas; **el módulo NO filtra por `business_id`**
(contrato D-16, el caller ya filtró); `isBlockWildcard` mira **todas** las filas, incluidas las de
servicios inactivos.

---

### 4. `test/time-block-services.test.ts` (test puro, extender)

```ts
// Source: test/time-block-services.test.ts:1-27
import { describe, it, expect } from 'vitest'
import { blocksForService, isServiceScheduled, ... } from '@/lib/time-block-services'
import type { TimeBlockService } from '@/lib/types'

// ⚠ El estándar del workstream es el CONTROL NEGATIVO ... los casos con la puente VACÍA son el
// camino comodín, o sea el comportamiento de HOY — pasan aunque la regla no exista ...

function block(id: string, start_time: string, end_time: string): BlockWindow { return { id, start_time, end_time } }
function map(time_block_id: string, service_id: string, business_id = 'biz'): TimeBlockService { return { business_id, time_block_id, service_id } }
```

**Estructura a copiar:** un `describe` por función nueva con el título en formato
`'nombreFn — <qué congela> (D-xx)'`, factories reusadas (`block()` / `map()` ya existen: **no crear
otras**), y **un `it('CONTROL NEGATIVO: ...')` emparejado por cada caso comodín**. Caso mordedor
obligatorio de esta fase: *franja con un solo mapeo a un servicio **inactivo** ⇒ `isBlockWildcard`
devuelve `false`*.

---

### 5. `app/(dashboard)/agenda/page.tsx` (RSC, read path)

```ts
// Source: app/(dashboard)/agenda/page.tsx:28-56 — el Promise.all destructurado posicionalmente
const [{ data: timeBlocks }, { data: locations }, ... ] = await Promise.all([
  supabase.from('time_blocks').select('*').eq('business_id', business.id).order('day_of_week').order('start_time'),
  ...
  // Datos para el form compartido "Nuevo turno" (D-08), filtrados por business_id en el server (T-01-14).
  supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
])
```

Las **2 queries nuevas** entran acá con estos moldes:

```ts
// Source (shape de la puente): app/api/booking/availability/route.ts:167-170
.from('time_block_services').select('business_id, time_block_id, service_id').eq('business_id', business.id)

// Source (catálogo completo, sin filtro de active): app/(dashboard)/servicios/page.tsx:22
.from('services').select('*').eq('business_id', business.id).order('created_at')
```

⚠ La query `services` existente (`:53`) **NO se toca** — la consume `NuevoTurnoForm` y meterle
inactivos es una regresión del alta manual. El catálogo va como **prop nueva** (`serviceCatalog`).

---

### 6. `app/(dashboard)/settings/settings-client.tsx` (pre-check + copy de D-07)

```ts
// Source: settings-client.tsx:1174-1209 (openDeleteService)
const [futDias, futHoy, abo, hist] = await Promise.all([ ... ])
if (delReqRef.current !== req) return
// Sin los cuatro counts no hay pre-check: cualquier fallo (red, RLS, parse del `.or(...)`) es
// 'error', NUNCA un 0 silencioso.
if (futDias.error || futHoy.error || abo.error || hist.error) {
  console.error('[settings/delete-service] pre-check falló:', ...)
  setDelInfo('error')
  return
}
```

El 5º count entra **en el mismo `Promise.all`** y **en el mismo guard** (P-08 · WR-02): sin rama nueva
de fail-open. Query: `.from('time_block_services').select('time_block_id', { count: 'exact', head: true }).eq('business_id', business.id).eq('service_id', s.id)` — el molde `head: true` ya está en
`abo`/`hist` (`:1197-1200`).

La copy se concatena en `delDescription` (`:1233-1247`), **rama confirmable únicamente** (la última del
ternario encadenado, `:1246-1247`), respetando el estilo de pluralización manual que ya usa esa rama
(`${delInfo.history === 1 ? 'turno' : 'turnos'}`).

---

### 7. `app/[slug]/booking-client.tsx` (copy pública de D-18)

```tsx
// Source: app/[slug]/booking-client.tsx:397-403
} else if (data?.error === 'any_professional_unsupported') {
  // T-12-11: el server rechaza "Cualquiera" sobre un servicio de recurso simultáneo (D-13). La
  // tarjeta ya está oculta arriba (showAny), así que esto sólo se ve con una pestaña vieja o un
  // servicio que cambió de modo mientras el cliente reservaba: se pide elegir profesional en vez
  // de un "Error al confirmar" genérico.
  toast.error('Para este servicio tenés que elegir un profesional. Recargá la página e intentá de nuevo.')
}
```

Molde **exacto**: rama por `data?.error === '<codigo>'`, **antes** del `else` genérico (`:404-406`),
con comentario que explica cuándo es alcanzable el error y por qué la copy dice lo que dice.

---

## Shared Patterns

### Aislamiento por tenant (aplica a: 074, `agenda/page.tsx`, `agenda-client.tsx`, `settings-client.tsx`)
**Fuente:** `settings-client.tsx:1739-1749` + `.claude/skills/supabase-multitenant-rls/SKILL.md`.
Toda query/escritura del dashboard lleva `.eq('business_id', business.id)` **además** de la RLS. El
service-role no aparece en ninguno de los archivos de esta fase.

### Mapeo de errores de Postgres → copy propia (aplica a: `agenda-client.tsx`, `settings-client.tsx`)
**Fuente:** `settings-client.tsx:1282-1292`. `error.code` + `error.message?.includes(...)` → código de
dominio snake_case → copy del cliente. **Nunca** `toast.error(error.message)`.

### Logging con prefijo de módulo (aplica a todos los archivos TS)
**Fuente:** `settings-client.tsx:1206` (`console.error('[settings/delete-service] pre-check falló:', …)`).
Para esta fase: `[agenda/save-hours]` y `[agenda/page]`.

### Comentarios densos en español que explican el POR QUÉ (aplica a todos)
**Fuente:** `agenda-client.tsx:141-146` (por qué la ocupación salió a un módulo puro), `:1160-1166`
de settings, y la cabecera de `071`. El estándar es: qué decisión/migración lo introdujo, qué
alternativa se descartó y por qué. Vale igual para el SQL de la 074.

### Fail-closed en los pre-checks (aplica a: `settings-client.tsx`)
**Fuente:** `settings-client.tsx:1203-1209` + `:1214-1217`. Sin dato no se ofrece la acción; nunca un
`?? 0` que haga indistinguible "no hay nada" de "la query falló".

### Módulo puro decide, la UI solo pinta (aplica a: `agenda-client.tsx` + `lib/time-block-services.ts`)
**Fuente:** `agenda-client.tsx:141-144` (comentario que documenta la extracción a
`lib/agenda-occupancy.ts`) + cabecera de `lib/time-block-services.ts:1-30` (AGENDA-02). Prohibido un
`.filter().length === 0` inline en el JSX (P-07).

---

## No Analog Found

| Archivo | Rol | Data flow | Motivo |
|---|---|---|---|
| `supabase/migrations/074_*.sql` — **el bloque de grants** | migration | — | **No existe ninguna migración en el repo que revoque `EXECUTE` de una función.** Todas las que tocan privilegios de función hacen `GRANT EXECUTE ... TO "anon","authenticated","service_role"` sobre `book_slot_atomic` (041/042/058/062/063/064/068/069) — el molde a **no** copiar. El planner traslada la **forma** de `072:72-90` (REVOKE ALL / GRANT mínimo) al objeto FUNCTION, y toma el patrón `DO $$ … EXCEPTION WHEN insufficient_privilege` de `073:94-101` si además cierra el default del baseline. |
| `save_agenda_blocks` — **el algoritmo de diff jsonb** | migration | batch | No hay ninguna función en el schema que reciba `jsonb` y haga upsert-por-diff. `book_slot_atomic` aporta la **envoltura** (firma, DECLARE comentado, RAISE, search_path) pero no el cuerpo. Seguir `19-RESEARCH.md` §Pattern 1 (pasos 1-6 del diagrama) y su recomendación de `tmp_key` para la correlación (P-01, Open Question 2). |
| `reconcileBlockIds` / `buildSaveHoursPayload` | pure lib (opcional) | transform | Sin analog directo; el molde de **forma** es `lib/agenda-occupancy.ts` (módulo puro + suite exhaustiva) y el de **test** es `test/time-block-services.test.ts:1-27`. |

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/schema.sql`, `app/(dashboard)/agenda/`,
`app/(dashboard)/settings/`, `app/(dashboard)/servicios/`, `app/[slug]/`, `app/api/booking/`,
`lib/`, `components/crm/`, `test/`.
**Files scanned:** 14 leídos + 3 barridos por grep (migraciones con `ON FUNCTION`).
**Pattern extraction date:** 2026-08-25
