# Phase 2: Alta manual + Exports CSV - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning
**Source:** discuss-phase (decisiones técnicas resueltas vía skill `forjo-advisor`, delegadas por el usuario)

<domain>
## Phase Boundary

Feature nueva (NO behavior-frozen) de **CRUD de bajo riesgo** sobre la app Gestión:
1. **Alta manual de cliente** (CLIENT-01): el dueño carga un cliente que no vino por reserva.
2. **Badge de origen** (parte de CLIENT-01 / SC-2): cada cliente muestra Reserva · Manual · Importado.
   Introduce la columna `origin` en `clients` (**migración 049**) que la **Fase 3 (import CSV, DATA-03)** va a consumir.
3. **Export CSV de clientes** (DATA-01) y **export CSV de finanzas** (DATA-02), cada uno acotado al negocio del dueño (aislamiento por tenant).

**Fuera de alcance:** import de clientes CSV (Fase 3, DATA-03 — solo se *reserva* el valor `importado` y se
alinea el header del CSV de clientes para el round-trip). Bandeja de Mensajes y demás add-ons: fuera del milestone.

**Riesgo dominante:** a diferencia de la Fase 1 (regresión), acá el aislamiento por tenant vuelve a ser crítico
en los dos exports y en el alta (todo se acota por `business_id` derivado de la sesión, nunca del cliente).
</domain>

<decisions>
## Implementation Decisions

Las 4 decisiones fueron resueltas por el advisor (todas técnicas; ninguna de negocio/costo/externo).

### D-01 — Columna de origen (`clients`, migración 049)
- **Modelo:** `origin text NOT NULL DEFAULT 'reserva' CHECK (origin IN ('reserva','manual','importado'))`.
  Patrón text+CHECK como el resto del esquema (status de appointments, plan_status) — NO enum Postgres
  (evita el dolor de `ALTER TYPE`, más extensible).
- **Backfill:** el `DEFAULT 'reserva'` cubre automáticamente las filas existentes (SC-2: los clientes que
  llegaron por reserva se muestran "Reserva").
- **Escritura:** el alta manual escribe `origin='manual'`. El valor `'importado'` queda **reservado para la Fase 3**
  (el import lo va a forzar).
- **Migración 049** = primera libre (045 landing_cms, 046 drop_business_hours, 047 backfill_vertical, 048 app_settings
  ya tomadas — NO renumerar las ajenas). `clients` **ya tiene RLS habilitada** (tabla existente) → la migración es
  solo `ALTER TABLE ... ADD COLUMN`, sin policies nuevas.

### D-02 — UX del alta manual (CLIENT-01)
- **Alta dedicada en `/clients`** (botón "Nuevo cliente" → form o modal), NO el alta inline acoplada a crear turno
  (`NuevoTurnoForm`): CLIENT-01 es explícitamente un cliente que NO vino por reserva.
- **Escritura server-side:** route handler / server action que **deriva `business_id` de la sesión** (owner_id) e
  inserta en `clients` con `origin='manual'`. Nunca confiar en un `business_id` del cliente (aislamiento por tenant).
- **Campos:** nombre (obligatorio) + **al menos un contacto** (teléfono o email); opcionales: notas, y obra social
  (`insurance_name` / `insurance_number`) **visible solo en vertical salud** (gateado por `resolveVertical`).
- Reusar las convenciones de validación existentes (react-hook-form + zod) y el patrón de mutación + toast (sonner).

### D-03 — Columnas del CSV
- **Clientes (round-trip con Fase 3):** header = `nombre, telefono, email, origen, notas, obra_social, nro_obra_social`.
  En el import (F3) la columna `origen` se ignora y se fuerza `importado`; las columnas de contacto/notas/obra social
  son las importables. Header estable = contrato de round-trip que la Fase 3 debe leer de vuelta.
- **Finanzas (export-only — la Fase 3 NO importa finanzas):** header = `fecha, tipo, concepto, monto`
  (tipo ∈ `turno | venta | egreso`). Columnas legibles para el dueño/contador, sin restricción de re-import.
- El planner/researcher mapea estos headers a los campos reales del modelo de finanzas (turnos pagados + ventas +
  egresos / `fixed_expenses`) — la sección Finanzas agrega varias fuentes.

### D-04 — Generación del CSV
- **Server-side**, dos route handlers **autenticados** (ej. `app/api/export/clients/route.ts`,
  `app/api/export/finances/route.ts`) que **re-derivan `business_id` de la sesión** y filtran por él;
  exportan **todas** las filas del negocio (no solo la página visible en el cliente).
- Respuesta: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename=...`,
  **UTF-8 con BOM — el carácter U+FEFF al inicio del archivo** para que Excel-AR muestre bien los acentos, escaping **RFC4180** (campos con
  coma/comilla/salto de línea entre comillas dobles; comilla interna duplicada).
- NO reusar el export client-side del CRM admin (`auditoria-client.tsx` / `negocios-client.tsx`): ese es contexto
  super-admin (otro rol/aislamiento). Acá el aislamiento por `business_id` del dueño manda → server-side.

### Claude's Discretion
- Slug/estructura exacta de los route handlers de export y del endpoint de alta (`/api/clients/create` vs server action).
- Form vs modal para el alta (ambos válidos; elegir según el patrón dominante de la pantalla Clientes).
- Nombre de archivo del CSV (ej. `clientes-{slug}-{fecha}.csv`) y orden de filas.
- Si el badge de origen se renderiza con el componente `Badge` de shadcn ya existente (probable) — mirar la lista de clientes.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements + roadmap del milestone
- `.planning/workstreams/gestion-rebrand/REQUIREMENTS.md` — CLIENT-01, DATA-01, DATA-02 (y DATA-03 = Fase 3, para el round-trip).
- `.planning/workstreams/gestion-rebrand/ROADMAP.md` §"Phase 2" — Goal + Success Criteria 1–4 + las 4 phase-level decisions.

### Aislamiento por tenant (crítico en esta fase)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas de RLS/migración/service-role; `clients` ya tiene RLS,
  el alta y los dos exports se acotan por `business_id` de la sesión.
- `.claude/skills/convenciones-forjo/SKILL.md` — naming, estructura, patrón de route handlers y Response.json.

### Fase 3 (consumidor del contrato)
- El header del CSV de clientes (D-03) es el contrato que el import de la Fase 3 (DATA-03) va a leer de vuelta.
  Cualquier cambio de columnas de clientes debe coordinarse con la Fase 3.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/(dashboard)/clients/page.tsx` + `clients-client.tsx` — pantalla de Clientes (server component que fetchea
  por `business_id` + client component con la lista). Acá va el botón "Nuevo cliente" (D-02) y el badge de origen (SC-2).
- Alta inline de cliente existente (estilo `NuevoTurnoForm`, presente en `agenda-client.tsx` / `appointments-client.tsx`):
  **referencia de cómo se inserta un cliente hoy** (validación, campos), pero NO se reusa el flujo acoplado a turno.
- `app/(crm)/admin/auditoria/auditoria-client.tsx` y `admin/negocios/negocios-client.tsx` — patrón de export CSV
  **client-side** (armado de CSV + descarga). Referencia de formato/escape; NO del contexto de aislamiento (es super-admin).
- Tabla `clients` (columnas actuales): `id, business_id, name, phone, email, notes, created_at, status, client_number,
  insurance_name, insurance_number, preferences`. **No tiene columna de origen** → la agrega la migración 049.
- Finanzas: `app/(dashboard)/finances/finances-client.tsx` + tabla `fixed_expenses` (egresos fijos) + turnos pagados +
  ventas — el modelo de movimientos que alimenta el CSV de finanzas (D-03).

### Established Patterns
- **Aislamiento por tenant:** toda query del dashboard filtra por `.eq('business_id', business.id)`; `business` se
  resuelve server-side por `owner_id`. Alta y exports lo siguen igual.
- **Route handlers:** `app/api/.../route.ts` con `Response.json({ ok, ... })`; validación defensiva del body; errores
  en snake_case. Los exports devuelven `text/csv` en vez de JSON.
- **Migraciones:** SQL numerado en `supabase/migrations/NNN_*.sql`, aplicado a mano y en orden. 049 = próxima.
- **Verticales:** `resolveVertical(business)` decide terminología y qué campos mostrar (ej. obra social solo en salud).

### Integration Points
- Migración `supabase/migrations/049_clients_origin.sql` (o nombre equivalente) + regenerar `supabase/schema.sql`.
- Nuevo entry point de alta en `clients-client.tsx` + endpoint/server action de creación.
- Nuevos route handlers de export (`app/api/export/...`) enlazados desde botones en Clientes y Finanzas.
</code_context>

<specifics>
## Specific Ideas
- El badge de origen usa los tres valores Reserva · Manual · Importado; el color/variante del `Badge` queda a discreción
  (mirar si ya hay un patrón de badge en la lista de clientes).
- BOM UTF-8 obligatorio en ambos CSV (Excel-AR corta los acentos sin él).
- El alta manual y el import (F3) comparten la columna `origin`: introducirla acá (049), consumirla en F3.
</specifics>

<deferred>
## Deferred Ideas
- **Import de clientes CSV** (DATA-03) — Fase 3. Acá solo se reserva `origin='importado'` y se fija el header del CSV de clientes.
- **Import de finanzas** — no está en el roadmap; el CSV de finanzas es export-only.
- **Campos de vertical adicionales en el CSV de clientes** (más allá de obra social) — evaluar si aparecen nuevos verticales.
</deferred>

---

*Phase: 2-Alta manual + Exports CSV*
*Context gathered: 2026-07-06 (decisiones técnicas vía forjo-advisor)*
