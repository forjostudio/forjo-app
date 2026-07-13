# Phase 2: Configuración de Canchas - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

El dueño de un negocio de canchas gestiona sus canchas desde el dashboard como **entidad
reservable unificada**: cada cancha tiene nombre, **precio propio** y **duración fija propia**
(variable entre canchas — ej. Cruzada A 60min, Cancha 11 90min), y se asocia a uno o más
**espacios físicos** del motor de v0.12. Reemplaza la UI genérica interina de config de espacios
(`settings-client.tsx` view="equipo" + tab Equipo, ya guardeado en Phase 1) por una experiencia
propia de canchas.

**Reusa el motor de v0.12 SIN re-migrar el core:** cada cancha sigue mapeando a una agenda
(`professionals`) + sus `spaces` vía `agenda_spaces`; el mapeo cancha→espacios acopla la
disponibilidad exactamente como hoy.

**Fuera de scope (esta fase):** booking público de alquiler (Phase 3), selección de duración por
el cliente (descartado por diseño), turnos fijos/recurrentes (diferido), staff/profesionales en
canchas (diferido v2), pricing por franja (diferido v2). NO re-migrar el motor.
</domain>

<decisions>
## Implementation Decisions

### Modelo de precio + duración (decisión central de la fase)
- **D-01:** El precio y la duración fija de la cancha viven en **`services`** (Opción A). Cada
  cancha = **1 fila en `services`** (que ya tiene `price` + `duration_minutes`) atada **1:1** a su
  agenda (`professionals`). Reusa TODO el camino existente de booking / precio / seña /
  disponibilidad y el **anti-solape-por-duración** del motor → Phase 3 consume la cancha casi sin
  cambios. **Refinado por research (ver D-06):** NO hay FK services↔professionals hoy, así que el
  1:1 se materializa con **UNA columna aditiva** (`professionals.service_id`) — NO se agregan
  tablas ni columnas de precio/duración (siguen en `services`), NO se toca RLS; el core de D-01
  (reusar el camino precio/seña, mínima migración) se mantiene.

### Mecanismo del linkeo 1:1 (refinación de D-01, lockeado tras research)
- **D-06:** El puntero estable cancha↔agenda es **una columna nueva nullable `professionals.service_id`
  (FK → `services.id`)**, vía **migración aditiva 043** (no destructiva; sobre el baseline 040+).
  La **cancha = la fila de agenda (`professionals`)** —que es lo que el motor ya reserva y lo que
  `agenda_spaces` ya mapea— con un puntero a su `service` de precio+duración. Dada una cancha se
  reconstruye su tupla (service + spaces) por ese FK + `agenda_spaces`. Se DESCARTÓ reusar
  `professionals.specialty` como puntero (hacky: UUID en campo semántico de especialidad, frágil).
  La columna es nullable: las filas `professionals` de salud/belleza/general la dejan en null
  (cero regresión). RLS: la columna vive sobre `professionals` (ya RLS por `business_id`) → sin
  policy nueva.

### La cancha como entidad unificada (auto-provisión)
- **D-02:** Crear una cancha es **una sola acción de UI** que auto-provisiona, por debajo:
  (1) un `Service` (nombre + precio + duración), (2) su agenda `professionals` (el "bucket" del
  motor contra el que se reserva), (3) su(s) `Space` + el mapeo `agenda_spaces`. El dueño ve y
  edita "una cancha"; la tupla (service + agenda + spaces) es plomería del planner/executor. Toda
  fila auto-provisionada **setea `business_id`** (aislamiento por tenant).

### Ruta / UI de gestión
- **D-03:** El manager de canchas vive en la pantalla **`/servicios` existente** (ya rotulada
  "Canchas" en el menú del vertical canchas que dejó Phase 1, vía terminology `service→Cancha`),
  **adaptada** para el vertical: campos de cancha (nombre + precio + duración) + mapeo de espacios
  + auto-agenda. La config de espacios/agenda que vivía en el **tab Equipo** (`settings-client.tsx`
  view="equipo", guardeado con redirect en Phase 1) **migra acá**. NO se crea ruta nueva ni se
  toca el menú de Phase 1.

### UX del mapeo cancha→espacios
- **D-04:** **Auto 1:1 por defecto + compartir opcional.** Cada cancha nueva crea su **propio
  `Space` dedicado** automáticamente (caso común: canchas independientes), sin que el dueño piense
  en "espacios". Un control **avanzado opcional** permite marcar "esta cancha **comparte espacio**
  con X" para el caso de canchas cruzadas (ej. F11 → {A,B,C}, que al reservarse bloquea a las
  cruzadas — criterio 3 del ROADMAP). Esconde la complejidad del motor para el ~90% de los casos y
  soporta el sharing requerido sin debilitar el acople de `agenda_spaces`.

### Borrado de cancha
- **D-05:** **Soft-delete** (`active = false`, mismo patrón que `services` hoy). Una cancha
  desactivada desaparece del booking público y del alta de nuevas reservas, pero **conserva las
  reservas existentes**. Hard-delete solo permitido si la cancha no tiene reservas.

### Claude's Discretion
- Validaciones exactas (precio > 0; duración > 0, en minutos; min/max o múltiplos; presets de
  duración 30/60/90 vs input libre) — seguir los patrones de validación de `services`.
- Si el form de cancha reusa el componente de servicios existente o uno adaptado.
- Mecánica exacta del control "compartir espacio" (dropdown de canchas/espacios existentes, etc.).
- Etiquetado, orden y filtro activo/inactivo de la lista de canchas.
- Mecanismo concreto del linkeo 1:1 agenda↔service para canchas (a resolver en research/planning
  según cómo `services` se vincula hoy a `professionals`).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Modelo de datos (núcleo de esta fase)
- `lib/types.ts` — `Service` (id, name, **`duration_minutes`**, **`price`**, active, location_ids),
  `Professional` (eje de agenda), `Space` (espacio físico, migr. 042), `AgendaSpace` (puente
  agenda↔espacio), `Appointment` (referencia `professional_id` + `service_id`).

### UI a adaptar / migrar
- `app/(dashboard)/servicios/` — pantalla del manager de canchas (D-03); hoy CRUD de servicios.
- `app/(dashboard)/settings/settings-client.tsx` (view="equipo") — config interina de
  espacios/`agenda_spaces` que migra al manager de canchas (D-03).

### Camino de booking / precio / seña que se reusa (NO se re-implementa)
- `app/api/booking/create/route.ts` + `lib/booking-core.ts` — el core lee duración/precio del
  `service`; la seña es business-level (`require_deposit`, `deposit_amount`). Reusado tal cual.
- `app/api/booking/availability/route.ts` — disponibilidad acoplada por espacio (motor v0.12).

### Motor de espacio compartido (v0.12, live — NO re-migrar)
- `supabase/migrations/040`, `041`, `042` — `spaces` / `agenda_spaces` / `appointment_spaces`,
  `book_slot_atomic` (advisory lock por espacio + anti-solape por duración + EXCLUDE backstop).

### Vertical (Phase 1, ya cerrada)
- `lib/verticals.ts` — vertical `canchas`: terminology `service→Cancha`/`services→Canchas`,
  `location→Sede`; menú con `'servicios'` (→"Canchas") y `'consultorios'` (→"Sedes"), sin `equipo`.

### Roadmap / requirements / skills
- `.planning/workstreams/canchas/ROADMAP.md` §"Phase 2" — goal, 4 criterios, decisión de fase.
- `.planning/workstreams/canchas/REQUIREMENTS.md` — CANCHA-01, CANCHA-02, CANCHA-03.
- Skill `supabase-multitenant-rls` — aislamiento por tenant (no hay tablas nuevas, pero el
  auto-provision debe setear `business_id` en cada fila).
- Skill `mercadopago-suscripciones` / camino de seña — la cancha reusa el deposit business-level.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`services`** ya tiene `price` + `duration_minutes` y RLS por `business_id` (del milestone
  seguridad) → reusar = cero migración de esquema y cero RLS nueva para precio/duración.
- **`spaces` / `agenda_spaces`** (motor v0.12) ya con RLS por tenant; el acople de disponibilidad
  ya funciona — D-04 solo decide la UX de cómo el dueño los crea/mapea.
- El **core de booking** (`lib/booking-core.ts`) calcula duración/precio desde el `service` → si la
  cancha ES un service, Phase 3 consume la cancha sin cambiar la fuente de precio/duración.

### Established Patterns
- **Soft-delete vía `active: boolean`** (services) — D-05 lo reusa.
- **Auto-provisión de filas relacionadas** en una server action (patrón a usar para crear
  service + professional + space + agenda_space en una transacción, todos con `business_id`).
- Server Components async + `*-client.tsx` para interactividad (patrón del dashboard).

### Integration Points
- Adaptar `app/(dashboard)/servicios/` (manager de canchas) para el vertical canchas.
- Migrar la config de espacios/`agenda_spaces` desde `settings-client.tsx` view="equipo".
- Linkeo 1:1 agenda↔service: **punto a resolver en research** según cómo `services` se vincula hoy
  a `professionals` (join table vs campo). Determina el mecanismo de auto-provisión de D-02.

### Security / Isolation (relevancia: Medio)
- **SIN tablas/columnas nuevas** → reusa la RLS existente de `services`/`spaces`/`agenda_spaces`.
- El secure-phase gate verificará: que cada fila auto-provisionada (service/professional/space/
  agenda_space) setee `business_id`; que un negocio no pueda mapear/acoplar canchas o espacios de
  otro tenant; que el precio/config interna NO se exponga a `anon` (eso lo cubre Phase 3 vía vista
  acotada, patrón `public_services`/`public_professionals`).
</code_context>

<specifics>
## Specific Ideas

- Duración **fija por cancha, variable entre canchas** (Cruzada A 60min, Cancha 11 90min) — del
  ROADMAP, ya soportado por el anti-solape-por-duración del motor.
- El cliente **no elige duración** (Phase 3); la cancha tiene la suya.
- Caso canónico de espacio compartido: F11 → {A, B, C} (reservar F11 bloquea las tres cruzadas).
</specifics>

<deferred>
## Deferred Ideas

- **Pricing por franja horaria (peak/off-peak)** — PRICING-FRANJA-01, v2. La decisión D-01 (reusar
  `services`) NO lo bloquea; se sumaría como capa de pricing sobre el service.
- **Staff/profesionales en canchas** — STAFF-CANCHAS-01, v2 (~1% de los casos; add-on).
- **Turnos fijos / abonos recurrentes** — diferido (ver memoria `turnos-fijos-recurrentes` y el
  `<deferred>` de Phase 1); capacidad nueva, milestone/fase propia.

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 2-Configuración de Canchas*
*Context gathered: 2026-06-30*
