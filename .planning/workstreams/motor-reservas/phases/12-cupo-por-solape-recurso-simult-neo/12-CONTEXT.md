# Phase 12: Cupo por solape (recurso simultáneo) - Context

**Gathered:** 2026-07-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Que "cupo N" signifique lo correcto según el caso. Cada **servicio** se marca como **clase grupal** (cupo contado por hora de inicio exacta — comportamiento actual, intacto) o **recurso simultáneo** (cupo contado por **solape de intervalos** usando `duration_minutes`). El modo nuevo **coexiste** con el actual, no lo reemplaza. El control corre **DENTRO del RPC atómico `book_slot_atomic`** (`SECURITY DEFINER`), re-granularizando el advisory lock y separando la asignación de `seat` del criterio de cupo, con **cero regresión** de los cuatro consumidores del RPC (booking público, alta manual, generación forward de abonos, canchas) + cupo 1 + multi-staff + espacio compartido. Migración numerada nueva **062** (`CREATE OR REPLACE FUNCTION`, aplicada a mano coordinada con el deploy). **Security-sensitive — secure-phase obligatorio.**

Requisitos: CUPO-01..CUPO-05 (ver REQUIREMENTS.md del workstream).

</domain>

<decisions>
## Implementation Decisions

### Modelo de datos (flag + cupo)
- **D-01:** El modo por servicio se modela como **enum extensible**, no boolean: nueva columna `services.capacity_mode text NOT NULL DEFAULT 'group_class'` con CHECK `IN ('group_class','simultaneous_resource')`. Default = `group_class` ⇒ cero regresión (todas las filas existentes y nuevas nacen en el modo actual sin backfill). Molde exacto: `businesses.public_selector_default` (migr. 061) y `abono_window_weeks` (migr. 055). Elegido enum sobre boolean para sumar modos futuros sin re-migrar.
- **D-02:** El cupo N del recurso simultáneo vive en una **columna nueva `services.capacity` (default 1)**, que usa **SOLO** el modo `simultaneous_resource`. La clase grupal sigue leyendo `time_blocks.capacity` **intacto** (el cupo del grupal es de *la clase/slot* — yoga 16:00=10, 18:00=15 — y no se puede mover al servicio sin romper el caso actual). Motivo del split: `time_blocks.capacity` es por **bloque de agenda** (general para toda la persona en esa franja) y no puede expresar que la misma kinesióloga ofrezca "camilla" cupo 2 y "gimnasio" con otro cupo en la misma franja. Cada modo lee su propia fuente.

### Semántica del cupo por solape
- **D-03:** El conteo por solape es **por servicio**: una reserva de `simultaneous_resource` compite únicamente contra otros turnos **del mismo `service_id`** que se solapan en su intervalo (inicio + `duration_minutes`). Una consulta normal de la misma persona a la misma hora NO resta contra el cupo de "camilla".
- **D-04:** **Cruce entre servicios (v1) = carriles independientes.** Un servicio simultáneo no bloquea ni es bloqueado por otros servicios de la misma persona; cada servicio simultáneo tiene su propio "carril" de N lugares en paralelo. Marcar un servicio como `simultaneous_resource` **es** el opt-in a correr en paralelo — los servicios no marcados quedan estrictos como hoy. (El control fino por-dueño de paralelismo cross-servicio queda **diferido**, ver Deferred.)
- **D-05:** El **`seat`** sigue atado al **slot exacto** (posición dentro del `date+time` exacto) para no chocar con el índice único 011. El solape es solo el **gate del cupo** (criterio de rechazo), separado de la asignación de asiento — nunca se evalúa el asiento por solape.

### Concurrencia / integridad (núcleo — secure-phase)
- **D-06:** **Re-granularización del advisory lock dependiente del modo.** Hoy el lock es `hashtextextended(business_id + date + time)` (058) → dos reservas **escalonadas** (distinto `time`) toman locks distintos y se cuelan del conteo por solape. Dirección propuesta: para `simultaneous_resource`, el lock pasa a `hashtextextended(business_id + service_id + date)` — serializa todas las reservas de *ese servicio ese día*, que es exactamente el conjunto donde el conteo por solape debe ser consistente. Para `group_class` y cupo 1, se **mantiene el lock fino actual** (no se baja la concurrencia del caso común). **El researcher valida** que componga con: (a) el widening de "cualquiera" de Phase 9 (058), (b) los locks por espacio de Phase 3 (042, orden ascendente anti-deadlock), y que **no degrade** `slot_full`/`slot_taken` ni el caso cupo 1.
- **D-07:** El nuevo conteo por solape y la lectura del flag `capacity_mode`/`capacity` se hacen **DENTRO** del mismo `book_slot_atomic` (`SECURITY DEFINER`, RLS NO protege adentro): toda query nueva filtra por `business_id = p_business_id` **explícito**, y el flag por servicio se re-valida por `business_id` sin confiar en IDs del cliente (el RPC ya recibe `p_service_id`).
- **D-08:** **CUPO-04 se verifica con un test de carrera real contra la DB** (N+1 reservas escalonadas concurrentes sobre un recurso de cupo N nunca superan el cupo), no con lectura de código. Molde: los tests de concurrencia CONC-01/CONC-03 (Phases 2/3).

### UX del panel
- **D-09:** El switch de modo es un **segmented control** "Clase grupal / Recurso simultáneo" + **microcopy** que explica la diferencia (ej. "Clase: todos empiezan a la misma hora. Recurso: turnos escalonados en paralelo"), en el **editor de servicio** (`/servicios`). Junto a él, el campo de cupo N cuando el modo es `simultaneous_resource`.
- **D-10:** **Labels fijos para todos los negocios** (no adaptados por vertical en v1). El concepto ya es bastante universal; adaptar la terminología por vertical (`lib/verticals`) queda como pulido futuro.
- **D-11:** **Roster del admin en modo simultáneo = filas individuales + aviso "lleno".** Cada turno del recurso se muestra como una fila normal en la grilla con su horario (el solape se ve en la propia grilla); cuando el intervalo alcanza el cupo, un indicador "lleno" (ej. "2/2 camillas"). NO se usa el contador "8/15" por franja del grupal (no aplica a horarios escalonados).

### Disponibilidad pública
- **D-12:** El grid público es **overlap-aware**: el endpoint de disponibilidad calcula el solape y marca "lleno" cuando el intervalo ya tiene `capacity` turnos solapados — el cliente no ve un horario que después falla en el servidor. Misma lógica de solape que el RPC, replicada en el read-path (`/api/booking/availability`). Se mantiene el no-leak de lugares restantes (D-06 de Phase 2).

### Multi-staff / "Cualquiera"
- **D-13:** **Restringido en v1:** un servicio `simultaneous_resource` **exige elegir profesional** en la reserva pública — NO ofrece "Cualquiera". Motivo: la asignación automática del RPC (Phase 9, 058) marca "ocupado" a quien tenga cualquier turno solapado, así que no sabría usar la 2ª camilla; hacerla capacity-aware es lógica extra sobre el núcleo en la fase de mayor riesgo. El soporte queda **diferido** (ver Deferred).

### Canchas
- **D-14:** **Cero regresión de canchas (confirmado).** Las canchas (que usan `services` con precio/duración, migr. 043) nacen `capacity_mode = 'group_class'` por el default; `services.capacity` no las toca; su exclusión por espacio (Phase 3, 042) sigue igual. El modo simultáneo NO aplica a canchas (una cancha se reserva de a 1).

### Claude's Discretion
- Mecanismo exacto de la re-granularización del lock (D-06) — dirección locked, detalle a validar/afinar por research contra semántica de Postgres.
- Estructura de la migración 062 (orden de ADD COLUMN + CREATE OR REPLACE FUNCTION), re-emisión de OWNER/GRANT con la firma completa (patrón 041/042/058), `NOTIFY pgrst, 'reload schema'`.
- Cómo se ramifica el cuerpo del RPC por `capacity_mode` (leer el flag una vez y bifurcar lock + conteo).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap / requisitos del workstream
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 12" — Goal, Success Criteria, Security/Integrity relevance (incluye la "Decisión abierta" que este CONTEXT cierra).
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — CUPO-01..CUPO-05 + Traceability.
- `.planning/PROJECT.md` — proyecto compartido (aislamiento por tenant, integridad de pagos).

### Núcleo del RPC (el archivo que se modifica)
- `supabase/migrations/058_professional_auto_assignment.sql` — **cuerpo VIGENTE de `book_slot_atomic`**: advisory lock actual `hash(business_id+date+time)`, selección "cualquiera", conteo `v_occupied` por slot exacto, asignación de `seat`, exclusión por espacio. Punto de partida de la migr. 062.
- `supabase/migrations/041_time_blocks_capacity_and_seat.sql` — capacity en `time_blocks`, `seat`/`is_group` en appointments, índice 011 capacity-aware, EXCLUDE 013 condicional, primera versión del RPC.
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` — exclusión acoplada por espacio (locks por espacio en orden ascendente anti-deadlock) que la 062 debe preservar.
- `lib/booking-core.ts` (`createAppointmentCore`) — el core por donde entran los CUATRO callers; mapea el error del RPC a `slot_full`/`slot_taken`. La firma del RPC NO cambia (14 params + RETURNS TABLE byte-idéntico).

### CONTEXT de fases relacionadas (mismo núcleo)
- `.planning/workstreams/motor-reservas/phases/02-cupos-grupales/02-CONTEXT.md` — modelo capacity + anti-sobrecupo atómico + tests de concurrencia.
- `.planning/workstreams/motor-reservas/phases/03-espacio-compartido/03-CONTEXT.md` — exclusión por espacio + CONC-03 (molde del test de carrera).
- `.planning/workstreams/motor-reservas/phases/09-asignaci-n-autom-tica-at-mica-de-profesional/09-CONTEXT.md` — widening del lock + "cualquiera" dentro del RPC (interactúa con D-06/D-13).

### Skills a aplicar
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — aislamiento por tenant en tabla/columna/RPC nuevos.
- `.claude/skills/convenciones-forjo/SKILL.md` — stack, arquitectura, convenciones.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `book_slot_atomic` (migr. 058) — se redefine in-place con `CREATE OR REPLACE FUNCTION` (misma firma), sin `DROP` (rompería los 4 callers).
- Editor de servicio en `/servicios` (app del dashboard) — donde vive el segmented control del modo + el campo de cupo N (D-09). Ya existe el CRUD de servicios (precio/duración desde v0.13 canchas, migr. 043).
- Tests de concurrencia CONC-01/CONC-03 (Phases 2/3, vitest contra la DB) — molde para CUPO-04.
- `public_services` (vista pública) — evaluar si necesita exponer `capacity_mode`/`capacity` para el read-path del booking, o si el flag solo se usa server-side. (Research decide; hoy la vista NO expone estas columnas.)

### Established Patterns
- Migración numerada + `supabase db reset` local (PG17, baseline + 040..062) como ÚNICA validación; prod se aplica a mano coordinado con el deploy + `NOTIFY pgrst, 'reload schema'`; luego regenerar `supabase/schema.sql`. Última migr. en prod = 060/061; la próxima = **062**.
- Columna con enum: `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT` + CHECK vía `pg_constraint` idempotente (molde 061/055).
- Conteo/lock atómico bajo `pg_advisory_xact_lock` en `SECURITY DEFINER` con `business_id` explícito en toda subquery.

### Integration Points
- Los CUATRO consumidores del RPC entran por `createAppointmentCore` (`lib/booking-core.ts`): booking público, alta manual (`app/api/appointments/create`), generación forward de abonos (cron), canchas. Un cambio de firma o semántica los afecta a los cuatro → cero regresión obligatoria.
- Read-path de disponibilidad: `app/api/booking/availability` (grid overlap-aware, D-12).
- Página pública: el selector de profesional (Phase 10) debe ocultar "Cualquiera" para servicios simultáneos (D-13).

</code_context>

<specifics>
## Specific Ideas

- Caso guía del dueño (kinesióloga): una misma persona ofrece "camilla" (recurso simultáneo, cupo 2 = 2 camillas en paralelo) y "gimnasio" con otro cupo, en la misma franja de agenda → motiva que el cupo N viva en el servicio (D-02) y que el solape se cuente por servicio (D-03).
- Framing del dueño: "recurso simultáneo" es el inverso del espacio cruzado (Phase 3) — allá reservar uno bloquea a los otros; acá se permiten N turnos a la vez sobre el mismo recurso.

</specifics>

<deferred>
## Deferred Ideas

- **Control por-dueño de paralelismo cross-servicio** (opción 3 del cruce entre servicios): un ajuste por servicio que decida si corre en paralelo a OTROS servicios de la misma persona o no. En v1 se toma "carriles independientes" (D-04); el control fino sale como iteración futura.
- **Soporte de "Cualquiera" (multi-staff) sobre servicios recurso-simultáneo:** hacer la asignación automática del RPC capacity-aware por solape para que "libre" contemple los N lugares. En v1 se restringe (D-13). Futuro.
- **Terminología por vertical** de los dos modos (`lib/verticals`) — pulido futuro (D-10).
- **Repensar el modelo de planes/límites de "cantidad de agendas" → "cantidad de profesionales/canchas"** — toca pricing y enforcement ([[plan-model-agendas]]); es un **milestone aparte**, fuera de motor-reservas.

</deferred>

---

*Phase: 12-cupo-por-solape-recurso-simult-neo*
*Context gathered: 2026-07-29*
