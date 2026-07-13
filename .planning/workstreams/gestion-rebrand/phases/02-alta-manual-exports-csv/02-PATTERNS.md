# Phase 2: Alta manual + Exports CSV - Mapa de Patrones

**Mapeado:** 2026-07-06
**Archivos analizados:** 9 (4 nuevos, 5 editados)
**Analogs encontrados:** 9 / 9 (todos con analog en el repo)

Todos los archivos de esta fase tienen un analog exacto dentro del propio repo. No hay archivos sin patrón: el `origin` es un `ADD COLUMN + CHECK` como el resto del esquema, el alta es un `Dialog` espejando los dos que ya viven en `clients-client.tsx`, el endpoint de alta clona `app/api/appointments/create/route.ts` (mismo aislamiento anon+RLS por `owner_id`), y los exports reusan la mecánica CSV (BOM + RFC4180) del CRM admin pero llevándola server-side.

---

## Clasificación de archivos

| Archivo nuevo/editado | Rol | Data Flow | Analog más cercano | Calidad del match |
|-----------------------|-----|-----------|--------------------|-------------------|
| `supabase/migrations/049_clients_origin.sql` (NEW) | migration | transform (DDL) | `supabase/migrations/043_professionals_service_id.sql` | exact (ADD COLUMN + CHECK) |
| `supabase/schema.sql` (regenerar) | config | — | patrón repo (regen tras migración) | exact |
| `lib/types.ts` (edit — `Client.origin`) | model | — | `interface Client` L168-183 | exact |
| `app/(dashboard)/clients/clients-client.tsx` (edit — Dialog alta + badge + botón export) | component | CRUD + request-response | Dialogs delete/merge L786-829 (mismo archivo) | exact |
| `app/(dashboard)/clients/page.tsx` (edit si hace falta) | route/page (server) | request-response | el propio archivo (ya trae `origin` con `select('*')`) | exact |
| `app/api/clients/create/route.ts` (NEW) | controller (route handler) | request-response | `app/api/appointments/create/route.ts` | exact (mismo tenant-por-owner_id + insert clients) |
| `app/api/export/clients/route.ts` (NEW) | controller (route handler) | file-I/O (text/csv) | `appointments/create` (auth) + `negocios-client.tsx` `rowsToCsv` (formato) | role+flow match |
| `app/api/export/finances/route.ts` (NEW) | controller (route handler) | file-I/O (text/csv) | idem export/clients | role+flow match |
| `app/(dashboard)/finances/finances-client.tsx` (edit — botón export) | component | request-response | header row L597-614 (mismo archivo) + botón export CRM | exact |

---

## Pattern Assignments

### `supabase/migrations/049_clients_origin.sql` (migration, DDL)

**Analog:** `supabase/migrations/043_professionals_service_id.sql` (ADD COLUMN aditivo sobre tabla que YA tiene RLS).

El patrón del repo: comentario de cabecera denso en español (contexto + qué hace + racional + "qué NO hace/invariantes"), luego el `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Como `clients` ya tiene RLS por `business_id`, la migración NO agrega policy (043 lo explicita: la columna hereda el aislamiento existente).

Estructura del DDL a espejar (043 L35-37):
```sql
ALTER TABLE "public"."professionals"
  ADD COLUMN IF NOT EXISTS "service_id" uuid REFERENCES ...;
```

Para 049, el modelo lockeado (D-01) es text+CHECK (como `appointments.status` / `plan_status`, NO enum Postgres):
```sql
ALTER TABLE "public"."clients"
  ADD COLUMN IF NOT EXISTS "origin" text NOT NULL DEFAULT 'reserva'
  CHECK (origin IN ('reserva','manual','importado'));
```

**Invariantes a documentar en la cabecera** (copiar el tono de 043 L24-33 / 047 L25-31):
- `DEFAULT 'reserva'` hace el backfill automático de filas existentes (SC-2) — no hace falta UPDATE separado.
- NO policy RLS nueva: `clients` ya es RLS por `business_id`.
- NO se aplica vía `supabase db push`. Validación única = `supabase db reset` local (PG17, replaya baseline + 040..049). Prod A MANO coordinado con el deploy + `NOTIFY pgrst, 'reload schema';`.
- **Tras aplicar: regenerar `supabase/schema.sql`** (patrón del repo, igual que 037/039/042/043).
- `'importado'` queda reservado para la Fase 3 (el CHECK ya lo admite; nadie lo escribe todavía).

**Numeración:** 049 = primera libre (045 landing_cms, 046 drop_business_hours, 047 backfill_vertical, 048 app_settings tomadas). NO renumerar ajenas.

**GATE (D-01):** la tarea de *aplicación* de la migración es `autonomous: false`. El ejecutor genera el SQL + regenera schema.sql, pero NO aplica a staging/prod. Igual criterio para el deploy (merge/push a `main` = release del usuario).

---

### `lib/types.ts` — agregar `origin` a `interface Client`

**Analog:** el propio `interface Client` (L168-183). Los campos son snake_case para coincidir con la fila de DB; opcionales con `?` cuando aplica. Como `origin` es `NOT NULL DEFAULT`, va NO opcional:
```typescript
origin: 'reserva' | 'manual' | 'importado'
```
Ubicarlo cerca de `status`/`client_number` (L175-176). Union type literal (mismo estilo que `Appointment.status` L216).

---

### `app/(dashboard)/clients/clients-client.tsx` (component — Dialog alta + badge + botón export)

**Analog exacto:** los dos `Dialog` que YA viven en este archivo — delete "¿Eliminar cliente?" (L786-799) y merge "Fusionar duplicados" (L802-829). El alta es un **tercer Dialog espejo**.

**Imports ya presentes** (NO agregar deps): `Dialog, DialogContent, DialogHeader, DialogTitle` (L14), `Button` (L10), `Input` (L11), `Label` (L12), `Textarea` (L13), `toast` de sonner (L6), `useVertical` (L9), `createClient` browser (L7). Falta agregar `Badge` de `@/components/ui/badge` y el icono `UserPlus`/`Download` de lucide (bloque de iconos L17-20).

**Patrón Dialog a espejar** (delete L786-799):
```tsx
<Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
  <DialogContent className="sm:max-w-sm">
    <DialogHeader><DialogTitle>¿Eliminar cliente?</DialogTitle></DialogHeader>
    ...
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
      <Button variant="destructive" onClick={deleteClient} disabled={deleting}>
        {deleting ? 'Eliminando...' : 'Eliminar'}
      </Button>
    </div>
  </DialogContent>
</Dialog>
```
Para el alta usar `sm:max-w-md` (como el merge L803), submit `bg-primary` "Guardar"/"Guardando..." (UI-SPEC C), fields con `Label` visible arriba de cada `Input`. El gating de obra social espeja el edit form inline: `{isSalud && (...)}` con `isSalud = vertical.key === 'salud'` (L121, ya definido); ver el uso existente L601-605 (`insurance_name` / `insurance_number`).

**Trigger del alta + botón export** — header del panel izquierdo (L417-427). Hoy tiene el `h1` + el botón de merge (L422-426). Agregar ahí "Nuevo cliente" (primary CTA, `UserPlus`) y "Exportar CSV" (`variant="outline"`, `Download`) en la misma fila `flex items-center justify-between`.

**Badge de origen** — en el bloque info de la fila (L536-540), bajo el nombre / junto a `{fichaNum(num)} · {cs?.visits} visitas` (L539). NO tocar el status dot (L542, es lifecycle status, coexiste). Variantes decididas (UI-SPEC §Color): `reserva`→`outline`, `manual`→`default`, `importado`→`secondary`. El componente `Badge` (`components/ui/badge.tsx`) ya expone esas tres variantes (L11-22) con `h-5` fijo.

**Success del alta** (UI-SPEC A): cerrar dialog + `setClients(prev => [nuevo, ...prev])` (hay `setClients` en el archivo, ver L775) + `toast.success('Cliente creado')`. Escritura server-side vía el endpoint nuevo (abajo) — NO insert directo desde el cliente para el alta (a diferencia de los updates inline que sí usan `supabase.from('clients').update(...)` L284/304).

---

### `app/(dashboard)/clients/page.tsx` (server page)

**Analog:** el propio archivo. Ya hace `select('*')` sobre `clients` filtrado por `business_id` (L19-22), así que `origin` viaja automáticamente en `initialClients` una vez que existe la columna + el type. **Probablemente no requiere edición** salvo que se quiera un select explícito de columnas. Patrón de resolución de tenant server-side (L7-16): `auth.getUser()` → `redirect('/login')` → business por `owner_id` → `redirect('/onboarding')`.

---

### `app/api/clients/create/route.ts` (NEW — route handler autenticado, alta)

**Analog exacto:** `app/api/appointments/create/route.ts`. Es el patrón canónico de escritura autenticada del dueño: cliente **anon+RLS** (`@/lib/supabase/server`, NUNCA admin/service-role), tenant resuelto por `owner_id`, e inserta en `clients`.

**Auth gate + resolución de tenant** (appointments/create L19-37):
```typescript
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

const { data: business } = await supabase
  .from('businesses')
  .select('id')
  .eq('owner_id', user.id)   // tenant = actor, NUNCA business_id del cliente
  .single()
if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
```

**Parseo defensivo del body** (L40-56): `try { raw = await request.json() } catch { return 400 'bad_request' }`, luego narrowing manual `typeof body.x === 'string' ? ... : null`. Validación: `name` obligatorio + al menos uno de `phone`/`email` (D-02) → si falta, `400 'missing_fields'` (L58-60).

**Insert exacto a espejar** (appointments/create L179-184, el `resolveClientId` (3)):
```typescript
const { data: created, error } = await supabase
  .from('clients')
  .insert({ business_id: business.id, name, phone, email, notes, insurance_name, insurance_number, origin: 'manual' })
  .select('*')
  .single()
```
`business_id` viene del `business.id` resuelto por sesión (NO del body). `origin: 'manual'` fijo. `insurance_*` solo se persisten si el vertical es salud (D-02) — el gateo de UI ya lo controla, pero el server puede ignorarlos si no salud. Respuesta: `Response.json({ ok: true, client: created })` para poder hacer el prepend optimista en el cliente. Error: mapear a `{ ok: false, error: 'insert_failed' }` (500), snake_case (convención Response.json del proyecto).

**Nota:** este archivo también muestra el patrón de dedupe por teléfono/email normalizado (L139-185) — opcional para el alta manual, pero disponible si se quiere evitar duplicados (D-02 no lo exige explícitamente; a discreción).

---

### `app/api/export/clients/route.ts` (NEW — route handler autenticado, text/csv)

**Analog de aislamiento:** `appointments/create/route.ts` (auth gate + tenant por `owner_id`, arriba).
**Analog de formato CSV:** `app/(crm)/admin/negocios/negocios-client.tsx` `rowsToCsv` (L126-143) — pero **traído server-side** (D-04 prohíbe reusar el export client-side del CRM: ese es super-admin, otro aislamiento).

**Escape RFC4180 + join** (negocios-client L128, 140-143):
```typescript
const esc = (v: string) => `"${v.replace(/"/g, '""')}"`   // comilla interna duplicada, campo entre comillas
const body = rows.map(r => [ ...cols ].map(c => esc(String(c))).join(','))
const csv = [headers.map(esc).join(','), ...body].join('\r\n')   // CRLF entre filas
```

**BOM UTF-8** (negocios-client L195, el `'﻿'` = U+FEFF al inicio del blob) — acá va delante del string CSV en la respuesta:
```typescript
return new Response('﻿' + csv, {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="clientes-${slug}-${fecha}.csv"`,
  },
})
```
(Es `Response` crudo, NO `Response.json` — los exports devuelven text/csv en vez de JSON, ver convención en CONTEXT L118.)

**Query:** `supabase.from('clients').select(...).eq('business_id', business.id)` — **todas** las filas del negocio (no la página visible), con `supabase` anon+RLS (defensa en profundidad). Sin sesión → 401; sin business → 404.

**Header contrato (D-03, round-trip con Fase 3):** `nombre, telefono, email, origen, notas, obra_social, nro_obra_social` (orden estable). Mapear cada columna del modelo `Client` (`name, phone, email, origin, notes, insurance_name, insurance_number`).

---

### `app/api/export/finances/route.ts` (NEW — route handler autenticado, text/csv)

**Analog:** idéntico a `export/clients` (auth + BOM + RFC4180 + `Response` text/csv). La diferencia es la **fuente de datos**: el CSV de finanzas agrega varias tablas del modelo de movimientos.

**Fuentes** (según `finances-client.tsx`, todas filtradas por `business_id`):
- **Turnos pagados** → `from('appointments').select('*, services(name, price)').eq('business_id', ...)` (analog L218/245); `tipo='turno'`, monto = `services.price`, concepto = nombre del servicio, fecha = `date`. Filtrar por pagos/no-cancelados según el criterio del modelo (`neq('status','cancelled')`, L245).
- **Ventas** → revisar el modelo de ventas usado en finances (`SavedProduct`/registro de venta); `tipo='venta'`.
- **Egresos** → `from('expenses').select('*')` (L222) — `interface Expense` (types L253-261): `category` (concepto), `amount` (monto), `expense_date` (fecha); `tipo='egreso'`. Más `from('fixed_expenses')` (L226, `interface FixedExpense` L271-280: `name`, `amount`, `frequency`) para gastos fijos.

**Header (D-03, export-only):** `fecha, tipo, concepto, monto` con `tipo ∈ turno | venta | egreso`. El planner/researcher debe confirmar el mapeo exacto de la fuente de ventas leyendo `finances-client.tsx` (las tres fuentes se combinan y ordenan por fecha).

**Filename:** `finanzas-${slug}-${fecha}.csv` (a discreción, D-03).

---

### `app/(dashboard)/finances/finances-client.tsx` (edit — botón export)

**Analog:** la fila de acciones del header (L603-613): `<div className="flex items-center gap-2 flex-wrap">` con controles `size="sm"` `variant="outline"`. Agregar ahí "Exportar CSV" (`variant="outline"`, `size="sm"`, icono `Download w-4 h-4`) junto al selector de período / toggle "Personalizado" (UI-SPEC C). Trigger: `<a href="/api/export/finances" download>` estilado como Button, o click-handler con `setExporting`/"Exportando..." (a discreción, D-04). Peso visual secundario (nunca `bg-primary`).

---

## Shared Patterns (transversales a la fase)

### Aislamiento por tenant (CRÍTICO — alta + 2 exports)
**Source:** `app/api/appointments/create/route.ts` L19-37 · skill `.claude/skills/supabase-multitenant-rls`.
**Apply to:** `api/clients/create`, `api/export/clients`, `api/export/finances`.
El `business_id` SIEMPRE se deriva de `owner_id` de la sesión (`auth.getUser()` → `businesses.eq('owner_id', user.id)`), NUNCA del body/cliente. Cliente Supabase = anon+RLS (`@/lib/supabase/server`), NUNCA `admin`/service-role. Toda query filtra `.eq('business_id', business.id)`. Sin sesión → 401 `unauthorized`; sin business → 404 `not_found`.

### Route handler + Response.json (convención del proyecto)
**Source:** `appointments/create` (todo el archivo) · CONTEXT L118 · convenciones-forjo.
**Apply to:** endpoint de alta (JSON) — `{ ok: true, ... }` / `{ ok: false, error: '<snake>' }`; status coherentes (400 validación, 401 auth, 404, 500 insert). Los **exports** son la excepción: devuelven `Response` crudo `text/csv`, no `Response.json`.

### CSV: BOM + RFC4180 (hand-authored, sin libs)
**Source:** `app/(crm)/admin/negocios/negocios-client.tsx` L126-143, 195.
**Apply to:** ambos exports. `esc = v => '"' + v.replace(/"/g,'""') + '"'`, filas unidas con `\r\n`, prefijo `'﻿'` (BOM) delante del string. Header estable como contrato (clientes = round-trip Fase 3). NO agregar dependencia de CSV (UI-SPEC Registry Safety).

### Vertical gating (obra social solo salud)
**Source:** `clients-client.tsx` L119-121, 601-605 · `resolveVertical`/`useVertical`.
**Apply to:** Dialog de alta (`{isSalud && (...)}` para `insurance_name`/`insurance_number`). NO modificar `lib/verticals.ts` (behavior-frozen, UI-SPEC guardrails).

### Reuse-only UI (sin componentes/deps nuevos)
**Source:** imports ya presentes en `clients-client.tsx` L6-20 · `components/ui/badge.tsx`.
**Apply to:** alta (Dialog/Button/Input/Label/Textarea + zod/sonner ya en stack) y badge (`Badge` con variantes existentes). Solo se agregan iconos lucide (`UserPlus`, `Download`) e import de `Badge`.

---

## No Analog Found

Ninguno. Los 9 archivos tienen patrón establecido en el repo.

---

## Metadata

**Scope de búsqueda:** `supabase/migrations/` (040-048), `app/(dashboard)/clients/`, `app/(dashboard)/finances/`, `app/api/appointments/create/`, `app/(crm)/admin/negocios/`, `components/ui/badge.tsx`, `lib/types.ts`.
**Archivos escaneados:** ~12.
**Fecha de extracción:** 2026-07-06.
