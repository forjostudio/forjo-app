# Phase 3: Espacio Compartido - Context

**Gathered:** 2026-06-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Modelar **agendas como recursos con espacio(s) físico(s) asociado(s)** y **acoplar su disponibilidad**: reservar una agenda en un horario bloquea a todas las que comparten alguno de sus espacios en el horario solapado (cancha F11 = {A,B,C}; cada cruzada = {A} | {B} | {C}). Es extender la regla anti-solape (hoy `appointments_no_overlap` / EXCLUDE gist 013, dentro de un bucket) a **nivel de espacio físico**, con el **mismo chequeo atómico** de la Phase 2 (`book_slot_atomic` + advisory lock). Construye ENCIMA del modelo de capacidad/concurrencia ya entregado (Phase 2, D-02) **sin re-migrar** `capacity`. Es la fase final del milestone, recortable si crece, sin tocar lo entregado por Phase 1 y 2.

**En alcance (Phase 3):** ESPACIO-01 (modelar agendas como recursos con espacios físicos asociados), ESPACIO-02 (exclusión acoplada bidireccional: reservar la F11 bloquea las 3 cruzadas y viceversa), ESPACIO-03 (chequeo "¿todos los espacios libres?" + insert atómico), CONC-03 (test anti-conflicto-de-espacio concurrente). Más: término genérico mínimo del eje de agenda ("Recurso/Cancha") para que el rubro canchas no vea "Profesional/Equipo" (label-only, ver D-05).

**Fuera de alcance:** vertical "canchas/deportes" completo (menú/types/copy propios) — diferido; waitlist (WAIT-01, v2); re-apertura del lugar al cancelar (CANCEL-REOPEN-01, v2); estrategia Google Calendar grupal (GCAL-GROUP-01, v2); generalizar el modelo de recurso más allá de lo que canchas/espacio compartido necesitan (out of scope del milestone).
</domain>

<decisions>
## Implementation Decisions

### Modelo de datos del espacio (ESPACIO-01)
- **D-01:** **Tabla `spaces` (espacios físicos por negocio) + tabla puente agenda↔espacio.** Una tabla de espacios físicos (A, B, C) + una tabla puente que mapea cada agenda a los espacios que ocupa (F11→{A,B,C}; cruzada A→{A}). Es el modelo general que escala y es literalmente lo que piden los success criteria. (Descarta el modelo de "relaciones de exclusión explícitas entre agendas" — pares que se bloquean: más simple de cargar al principio pero no escala —N² pares— y no modela el espacio como recurso reservable.) Ambas tablas son datos de tenant: RLS habilitada + policies por operación con `with check (business_id = ...)` + filtro por `business_id`; un negocio no puede mapear ni leer espacios de otro, ni acoplar disponibilidad cross-tenant.

### Qué es una "agenda"/recurso reservable
- **D-02:** **Reusar `professionals` como eje de la agenda.** Cada cancha y la F11 = una fila en `professionals` (el bucket de booking ya se keya por `COALESCE(professional_id, sentinel)`). Cero modelo nuevo de bucket; alineado con la decisión LOCKED de Phase 2 (D-02 de `02-CONTEXT.md`: "el profesional sigue siendo el eje de la agenda, NO se crea una abstracción `resource` genérica"). El público elige la agenda como hoy elige profesional → la exclusión acoplada cae sobre el bucket existente. (Descarta una entidad `resource` nueva genérica: semánticamente más limpia —una cancha no es un "profesional"— pero implica migrar el bucket/booking-core sobre el core que endureció v0.9 = más riesgo de regresión, justo lo que D-02 de Phase 2 evitó.)
- **Mapeo concreto del caso ancla:** predio = `business`; cada cancha (A, B, C) y la F11 = 4 filas en `professionals`; espacios A, B, C = 3 filas en `spaces`. Puente: cruzada A→{A}, cruzada B→{B}, cruzada C→{C}, F11→{A,B,C}.

### Naturaleza de la reserva de cancha (ESPACIO-02/03, CONC-03)
- **D-03:** **Capacity 1 + duración variable → conflicto por solape.** Cada cancha = 1 reserva a la vez, con duración variable (1h, 1h30, etc.). El conflicto entre agendas que comparten espacio es por **SOLAPE de tiempo**, NO por count de slot exacto. Esto **extiende la lógica del EXCLUDE 013 a nivel de espacio físico**: prohíbe dos turnos que solapen en tiempo Y compartan al menos un espacio. CONC-03 = test **anti-solape** concurrente (no anti-count). (Descarta "slot fijo como las clases grupales": reusaría `book_slot_atomic` tal cual —count por slot exacto— pero no refleja cómo se reservan canchas en la realidad —por franjas de duración variable.)
- **Consecuencia para `book_slot_atomic`:** hoy el RPC chequea slot exacto sobre UN bucket (count vs capacity). La exclusión por espacio necesita un chequeo **anti-solape multi-bucket**: para cada espacio que ocupa la agenda reservada, ¿hay algún turno SOLAPADO en cualquier agenda que comparta ese espacio? El detalle exacto (cómo se extiende el RPC o se agrega uno nuevo, cómo se keya el lock) es discreción de research/planner — ver "Claude's Discretion".

### UI de configuración (ESPACIO-01)
- **D-04:** **Dentro del editor de agenda/settings existente.** El alta de espacios y el mapeo agenda→espacios reusan los patrones de `settings-client.tsx` / `agenda-client.tsx` donde ya se editan `time_blocks` y profesionales. Menos superficie de UI nueva, consistente con lo existente. (Descarta una sección/pantalla nueva dedicada "Espacios/Canchas": más clara para el rubro pero más superficie y navegación nueva sobre la fase más riesgosa del milestone.)

### Terminología (rubro canchas)
- **D-05:** **Término genérico mínimo del eje de agenda — label-only, sin vertical nuevo.** Agregar UN término ("Recurso/Cancha") al sistema de terminología (`lib/verticals.ts` → `VerticalTerminology` hoy NO tiene término para "profesional"/"equipo") para que el rubro canchas vea "Cancha" en vez de "Profesional/Equipo" en agenda/config. NO se crea un `VerticalKey` nuevo ni menú/types propios. (Descarta diferir la terminología entera —peor UX: el dueño de canchas vería "Profesionales"— y descarta el vertical "canchas/deportes" completo —over-scope sobre la fase más riesgosa.) Nota: "Cancha de fútbol" YA es un `type` dentro del vertical `general`; el término del eje debe poder resolverse para ese caso sin romper los otros verticales.

### Claude's Discretion (técnico — LOCKED como atómico por roadmap/STATE)
- **Mecanismo atómico anti-conflicto-de-espacio (ESPACIO-03 / CONC-03):** LOCKED **chequeo atómico deliberado, NUNCA `count`/select suelto sin lock** (igual que CONC-01 de Phase 2). El advisory lock debe pasar a tomarse por **conjunto de espacios** que ocupa la agenda (no por un solo slot+bucket), en **orden estable** (ej. space_id ordenado) para evitar deadlocks entre reservas que peleen subconjuntos solapados de espacios. La forma exacta (extender `book_slot_atomic` vs RPC nuevo `book_space_slot_atomic`, lock por espacio vs lock por hash del set, cómo se hace el join a la tabla puente dentro del RPC `SECURITY DEFINER`) la define research/planner. La garantía real vive en la DB; el re-check JS sigue siendo solo UX.
- **Auto-conflicto de la F11:** la reserva de la F11 ocupa {A,B,C} pero es UNA fila (en el bucket de la F11). El chequeo de solape debe contar conflictos contra turnos de OTRAS agendas que comparten espacio, sin contar la propia fila de la F11 como 3 conflictos consigo misma.
- **Disponibilidad acoplada (`/api/booking/availability`):** debe reflejar el bloqueo cruzado — una cancha aparece ocupada en una franja si la F11 (o cualquier agenda que comparta su espacio) tiene un turno solapado, y viceversa. Cómo se computa (resolver espacios de la agenda → buscar solapes en agendas hermanas) es discreción de research/planner, manteniendo D-06 de Phase 2 (público ve libre/ocupado, no detalle interno).
- **Constraint a nivel de espacio:** evaluar si conviene un constraint DB (ej. EXCLUDE gist sobre una proyección turno×espacio, posiblemente vía tabla puente / columna desnormalizada) como respaldo atómico además del advisory lock, análogo a cómo 013 respalda hoy el anti-solape. Discreción de research/planner; LOCKED solo que el respaldo de integridad NO puede ser un `count` suelto.
- **Migración:** aditiva, post-baseline, numerada con separador underscore (siguiente disponible tras `041_…`, ej. `042_…`), RLS habilitada + policies por operación con `with check`, sin exponer el mapeo de espacios/ocupación viva a `anon` más allá de lo que ya permite D-06. Validar con `supabase db reset` local (PG17) ANTES de prod; prod se aplica a mano coordinado con el deploy + `NOTIFY pgrst, 'reload schema';`.
- **Reúso del core:** el chequeo de espacio + insert vive en el mismo punto atómico que reusan el booking público (service-role) y el alta manual autenticada (Phase 1) — ambos caminos heredan la exclusión por espacio sin duplicarla.
- **Validación de entrada y errores:** mismo estilo defensivo del repo; sumar el código de error de conflicto-de-espacio (ej. reusar `slot_taken` 409 o un código nuevo tipo `space_taken` 409 — decisión de research/planner) al mapeo, forma `{ ok, error }` snake_case, status coherentes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core de reservas a extender (corazón de la fase)
- `lib/booking-core.ts` — Única fuente de verdad de la cadena validación + insert (`createAppointmentCore`). Hoy llama a `book_slot_atomic` (RPC atómico). Acá entra la extensión de la exclusión por espacio físico; reusado por el booking público (service-role) y el alta manual autenticada.
- `supabase/migrations/041_time_blocks_capacity_and_seat.sql` — `book_slot_atomic` (SECURITY DEFINER + `pg_advisory_xact_lock`), índice 011 capacity-aware (con `seat`) y EXCLUDE 013 condicionado a `NOT is_group`. Es el patrón atómico exacto a extender a nivel de espacio (advisory lock por conjunto de espacios, chequeo anti-solape multi-bucket).
- `app/api/booking/create/route.ts` — Caller público (service-role) del core; mapea el resultado a la respuesta HTTP.
- `app/api/appointments/create/route.ts` — Caller del alta manual autenticada (Phase 1); también hereda la exclusión por espacio.
- `app/api/booking/availability/route.ts` — Cómo se computa disponibilidad (solapamiento, sentinela `00000000-...` para "sin profesional", estados `confirmed`/`pending_payment`, count vs `capacity`). Pasa a reflejar el bloqueo acoplado por espacio (D-06 de Phase 2 sigue: público ve libre/ocupado, no detalle).

### Constraints de integridad (NO debilitar; extender)
- `supabase/migrations/00000000000000_baseline.sql` — `appointments_no_double_booking` (índice único, ex-011, redefinido en 041) y `appointments_no_overlap` (EXCLUDE gist, ex-013) — el anti-solape dentro de un bucket que esta fase extiende a nivel de espacio.
- `supabase/migrations/040_appointments_clients_insert_with_check.sql` — Patrón de policies INSERT WITH CHECK por tenant; referencia de estilo para la migración nueva de `spaces` + puente.

### Modelo de dominio + UI (ESPACIO-01, D-02, D-04, D-05)
- `lib/types.ts` — Interfaces de dominio (`Professional`, `Location`, `TimeBlock` con `capacity`, `Appointment` con `seat`/`is_group`). Agregar tipos `Space` + el mapeo agenda↔espacio.
- `app/(dashboard)/settings/settings-client.tsx` — Editor de horarios/`time_blocks` por profesional/consultorio; acá entra el alta de espacios + mapeo agenda→espacios (D-04).
- `app/(dashboard)/agenda/agenda-client.tsx` + `app/(dashboard)/agenda/page.tsx` — Vista de agenda (carga `time_blocks`, `locations`, `professionals`, `appointments` por `business_id`); referencia de patrón de grilla.
- `lib/verticals.ts` — `VerticalTerminology` (hoy SIN término para "profesional"/"equipo"); "Cancha de fútbol" ya es un `type` del vertical `general`. Acá entra el término genérico mínimo del eje ("Recurso/Cancha") de D-05.
- `lib/use-terminology.tsx` — Provider de terminología que inyecta el vertical resuelto a los componentes client; consume el término nuevo.

### Aislamiento por tenant (no negociable)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — Reglas RLS / policies / `business_id` para las tablas nuevas (`spaces` + puente) y toda query de disponibilidad/exclusión.
- `lib/supabase/server.ts` — `createClient()` anon-key + RLS (alta manual / dashboard). `lib/supabase/admin.ts` — service-role (booking público).

### Encuadre y planning
- `c:\Users\franc\Desktop\Forjo Studio\forjo-cupos-grupales-brief.md` §8 — "agendas con espacio compartido": caso F11 = 3 cruzadas, reglas de disponibilidad acopladas, modelo recurso/espacio, concurrencia atómica, y la pregunta abierta del modelo (resuelta acá en D-01).
- `c:\Users\franc\Desktop\Forjo Studio\forjo-motor-reservas-encuadre.md` — Encuadre del milestone (faseo manual→cupos→espacio; B recortable como fase final).
- `.planning/workstreams/motor-reservas/ROADMAP.md` — Phase 3 goal + success criteria + security/integrity relevance.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — ESPACIO-01..03, CONC-03.
- `.planning/workstreams/motor-reservas/phases/02-cupos-grupales/02-CONTEXT.md` — Decisiones de Phase 2 (D-02 modelo "capacity sobre el modelo actual, professional = eje"; mecanismo atómico) sobre las que construye esta fase SIN re-migrar.

### Tests (la ingeniería real)
- `.planning/codebase/TESTING.md` — Estado de la suite Vitest (301 tests tras 02-05; molde TEST-01 + CONC-01/02 contra Supabase local con 041 aplicada). CONC-03 (anti-conflicto-de-espacio concurrente) extiende esta suite — criterio de éxito duro.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`book_slot_atomic` (migr. 041):** patrón atómico ya validado (advisory lock por slot+bucket + count + insert en una transacción SECURITY DEFINER que re-impone el tenant). La exclusión por espacio extiende EXACTAMENTE este patrón (lock por conjunto de espacios + chequeo anti-solape multi-bucket).
- **`lib/booking-core.ts` (`createAppointmentCore`):** ya centraliza re-check + RPC + traducción de constraint a `slot_taken`/`slot_full`. La exclusión por espacio se agrega acá una sola vez → público y alta manual la heredan.
- **EXCLUDE gist 013 (`appointments_no_overlap`):** anti-solape de duración variable por bucket; es la lógica exacta a extender a nivel de espacio físico (solape en tiempo Y comparte espacio).
- **`professionals` como bucket de agenda:** el modelo de bucket (`COALESCE(professional_id, sentinel)`) ya soporta tratar cada cancha/F11 como una agenda sin migrar el core (D-02).
- **`settings-client.tsx` + patrones de grilla / `vaul`/shadcn:** editor existente donde entra el alta de espacios + mapeo, sin dependencias nuevas (D-04).
- **`lib/verticals.ts` + `lib/use-terminology.tsx`:** sistema de terminología existente donde entra el término mínimo del eje (D-05).

### Established Patterns
- Toda query del dashboard filtra por `.eq('business_id', business.id)`; las tablas nuevas (`spaces` + puente) y las queries de exclusión respetan el mismo aislamiento.
- Errores `Response.json({ ok, error }, { status })` snake_case; conflicto de espacio = 409 (reusar `slot_taken` o sumar `space_taken` — discreción).
- Sentinela `00000000-0000-0000-0000-000000000000` para "sin profesional" en el bucket de solapamiento — preservarla byte-idéntica si el chequeo de espacio toca el bucket.
- Estados que ocupan lugar: `confirmed` + `pending_payment` (mismo WHERE de los constraints actuales).
- Migraciones post-baseline aditivas, numeradas con underscore, validadas con `supabase db reset` local antes de prod; coordinar prod a mano + reload del schema cache de PostgREST.

### Integration Points
- Tablas nuevas `spaces` + puente agenda↔espacio → leídas por el chequeo atómico de exclusión, por availability (bloqueo acoplado), y por la UI de config (D-04).
- `book_slot_atomic` (o RPC nuevo) → extendido a chequeo anti-solape multi-bucket por espacio, consumido por ambos endpoints de creación vía `booking-core.ts`.
- `/api/booking/availability` → refleja el bloqueo acoplado por espacio sin exponer detalle interno (D-06 Phase 2).
- Suite Vitest → CONC-03 (anti-conflicto-de-espacio concurrente).

</code_context>

<specifics>
## Specific Ideas

- **Caso ancla (brief §8):** predio con una cancha de fútbol 11 que físicamente son 3 canchas cruzadas alquilables por separado. Cada cancha = una agenda (un `professional`); la F11 ocupa el espacio de las 3. Reservar la F11 a las 20hs requiere A, B y C libres a las 20hs y, al confirmarse, bloquea las 3; reservar 1 cruzada a las 20hs bloquea la F11 a las 20hs (exclusión bidireccional).
- Reservas de cancha = duración variable (franjas), no slots fijos — el conflicto es por solape, no por count (D-03).
- El dueño de canchas no debería ver "Profesional/Equipo" en su dashboard: el eje se nombra "Recurso/Cancha" (D-05, label-only).

</specifics>

<deferred>
## Deferred Ideas

- **Vertical "canchas/deportes" completo** (nuevo `VerticalKey` con menú, types y términos propios). Considerado en D-05; se difiere a favor del término genérico mínimo del eje (label-only). Reconsiderar si el rubro canchas pide una experiencia de dashboard propia.
- **Entidad `resource`/`agenda` genérica** separada de `professionals`. Considerada en D-02; se difiere (igual que en Phase 2) — reusar `professionals` como eje evita migrar el core endurecido.
- **Modelo de "exclusión explícita entre agendas"** (pares que se bloquean, sin entidad espacio). Considerado en D-01; descartado por no escalar.
- **Constraint DB de respaldo a nivel espacio** (más allá del advisory lock). Marcado como discreción de research/planner; si no se implementa en esta fase, queda como hardening futuro (la garantía mínima es el chequeo atómico con lock).
- **Estrategia Google Calendar para reservas de espacio compartido / grupales (GCAL-GROUP-01).** v2 — no bloquea el motor.
- **Waitlist (WAIT-01)** y **re-apertura del lugar al cancelar (CANCEL-REOPEN-01).** v2.

</deferred>

---

*Phase: 3-Espacio Compartido*
*Context gathered: 2026-06-29*
