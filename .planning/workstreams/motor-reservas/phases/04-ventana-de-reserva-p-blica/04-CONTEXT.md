# Phase 4: Ventana de reserva pública - Context

**Gathered:** 2026-07-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Limitar cuánto en el futuro puede reservar un **cliente en la página pública** de un negocio,
configurable por el dueño. Requisitos: BOOK-WINDOW-01 (config global por negocio), BOOK-WINDOW-02
(cap en los dos calendarios públicos), BOOK-WINDOW-03 (backstop server anti-tampering).

**Fuera de scope:** el **alta manual autenticada** (`app/api/appointments/create`) NO se limita — la
ventana es exclusiva del flujo público. Anticipación **mínima** (no reservar dentro de X horas) y
ventana **por servicio** están diferidas (ver REQUIREMENTS Out of Scope). El aviso por mail del alta
manual es la Phase 5, no esta.
</domain>

<decisions>
## Implementation Decisions

### Modo y almacenamiento del límite
- **D-01:** El límite tiene **3 modos mutuamente excluyentes** (el dueño elige uno): (a) **días de
  anticipación** (rolling — N días desde hoy), (b) **fecha límite fija** (hasta un DD/MM/YYYY exacto),
  (c) **sin límite**. Pedido explícito del usuario sumar la fecha fija además de los días.
- **D-02:** Default = **30 días** (modo rolling) para TODOS los negocios en la migración — arregla de
  una el bug de reservas a años (no hay clientes reales → sin riesgo de sorprender a nadie).
- **D-03 (discreción del planner):** el schema exacto queda a criterio del research/planner. Sugerencia:
  `businesses.max_advance_days` (int, nullable) + `businesses.max_advance_date` (date, nullable); ambos
  null = sin límite; definir prioridad si conviven. Lo que importa: soportar los 3 modos de D-01.

### Control en Ajustes
- **D-04:** Un control en Ajustes (cerca de la config de reservas/horarios) que expone los 3 modos:
  input numérico en **días** + toggle **"sin límite"** + opción de elegir una **fecha exacta**. Forma
  exacta (radio de modos, toggle, date-picker) = discreción, siguiendo el design system.

### Feedback en el calendario público
- **D-05:** Cuando el cliente llega al tope: además de **deshabilitar** los días fuera de ventana y
  **capar** la navegación de mes, mostrar un texto **"Reservas hasta el DD/MM"** cerca del calendario
  (la fecha de corte efectiva, computada del modo activo). En los DOS calendarios.

### Alcance y semántica del borde
- **D-06:** Cambiar el límite afecta **solo reservas nuevas**: los turnos ya reservados más allá de la
  ventana quedan **intactos** (no se tocan ni se esconden ni se cancelan).
- **D-07:** El cálculo de la ventana usa **hora Argentina** (`America/Argentina/Buenos_Aires`, UTC-3 sin
  DST), consistente con el resto de la app.
- **D-08 (locked por roadmap):** enforcement en 3 capas — los 2 calendarios públicos capan (UX),
  `booking/create` valida server-side (backstop anti-tampering, no se confía en el cliente), y la
  disponibilidad es capa opcional.

### Claude's Discretion
- Schema exacto (columnas vs mode enum) y prioridad si conviven días + fecha (D-03).
- **Cómo llega el valor al calendario público sin abrir una lectura ancha de `businesses` a `anon`**
  (ver canonical refs / read-path) — el research lo confirma.
- Código de error del backstop (ej. `date_out_of_window`) siguiendo el patrón de errores del route.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Calendarios públicos (donde se capa + el texto)
- `app/[slug]/booking-client.tsx` — calendario custom mensual. Navegación `addMonths(m, 1)` SIN tope
  (~L563, el origen del bug de 3 años); `isDayOpen` (L140) y `calendarDays` (L147-151); días
  deshabilitados hoy por past/closed/out-of-month (L578-580). Acá va el cap + "Reservas hasta...".
- `app/[slug]/canchas-booking-client.tsx` — el gemelo de canchas. Mismo cap, mismo texto.

### Backstop server + read-path (el punto delicado)
- `app/api/booking/create/route.ts` — POST público (service-role, tenant por slug). Sumar la validación
  de fecha fuera de ventana como backstop (rechazo con status/código de dominio).
- `app/[slug]/page.tsx` — Server Component público que lee el negocio y pasa props al booking client.
  Es el read-path por donde el valor de la ventana debe viajar al calendario. **Research: confirmar si
  lee vía `public_businesses`/vista acotada o service-role, y sumar el/los campo(s) ahí SIN exponer
  `businesses` ancho a `anon`.**
- `app/api/booking/availability/route.ts` — disponibilidad por fecha (service-role por slug). Capa opcional.

### Config UI (dashboard)
- `app/(dashboard)/settings/settings-client.tsx` — Ajustes del negocio; acá va el control nuevo. Patrón
  de update a imitar: `setState` + `supabase.from('businesses').update({...}).eq('id', business.id)` +
  `toast` (ver `selectTheme`/`selectFont`, ~L190-217).

### Migración + aislamiento
- `supabase/migrations/` — migración nueva **048+** (baseline post-v0.13): columna(s) en `businesses`
  + default 30 días. La exposición pública del campo (vista/read-path) debe respetar el aislamiento.
- Skill `supabase-multitenant-rls` — reglas para no abrir `businesses` a anon; el campo va por el
  read-path acotado existente.

### Requirements
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — BOOK-WINDOW-01/02/03.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Calendario custom** de `booking-client.tsx` (NO react-day-picker): el cap se implementa ahí mismo —
  deshabilitar el botón "mes siguiente" cuando el mes mostrado supera el mes del corte, y deshabilitar
  los días posteriores al corte (sumar a la condición `disabled` existente).
- **`date-fns`** ya importado (`addMonths`, `isBefore`, `startOfDay`, `format`, etc.) — para computar y
  comparar la fecha de corte y formatear "DD/MM".
- **Patrón de settings update** en `settings-client.tsx` (selectTheme/selectFont): setState + update de
  `businesses` + toast.

### Established Patterns
- **Zona AR fija** (UTC-3 sin DST) en toda la app (D-07).
- **Aislamiento por tenant:** el público resuelve el negocio por slug (service-role en endpoints; vista
  acotada / read-path en `page.tsx`). NUNCA abrir `businesses` ancho a `anon`.
- **El alta manual (`appointments/create`) YA existe y NO se toca en esta fase** (es Phase 5 quien le
  suma el mail).

### Integration Points
- `businesses` (columna/s nueva/s) → `app/[slug]/page.tsx` (prop) → los 2 booking clients (cap + texto)
  → `app/api/booking/create` (backstop). Un solo dato que fluye del negocio al público.
</code_context>

<specifics>
## Specific Ideas

- Copy del feedback público: **"Reservas hasta el DD/MM"**.
- El usuario pidió explícitamente que el control permita, además de días y "sin límite", **elegir una
  fecha exacta** de corte (los 3 modos conviven en el mismo control).
</specifics>

<deferred>
## Deferred Ideas

- **Anticipación mínima** (no reservar dentro de las próximas X horas) — espejo del máximo; fuera de
  v0.22 (ya en REQUIREMENTS Out of Scope).
- **Ventana por servicio** — se eligió global por negocio (Out of Scope).

None más — la discusión se mantuvo dentro del scope de la fase.
</deferred>

---

*Phase: 4-ventana-de-reserva-p-blica*
*Context gathered: 2026-07-18*
