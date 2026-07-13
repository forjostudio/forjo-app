# Phase 2: Cupos Grupales - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Un bloque de horario (`time_blocks`) puede admitir **N reservas** (cupo) en vez de 1. Se agrega columna `capacity` (default 1) a `time_blocks`, se **redefinen los constraints de integridad 011/013 a capacity-aware** con **CERO regresión** para el caso cupo 1, y se implementa el **chequeo atómico anti-sobrecupo concurrente** en el alta (nuevo error `slot_full`). El público ve un horario "disponible/lleno" sin exponer lugares restantes; el admin ve contador (8/15) + roster. Esta fase LOCKEA el modelo "agenda como recurso" decidiéndolo ya contemplando las necesidades de espacio compartido de Phase 3.

**En alcance (Phase 2):** CUPOS-01 (cupo por bloque en el editor de agenda), CUPOS-02 (público disponible/lleno sin contador), CUPOS-03 (admite hasta `capacity`, rechaza el excedente con `slot_full`, anti-sobrecupo atómico bajo concurrencia), CUPOS-04 (admin: contador + roster), CUPOS-05 (seña por servicio, independiente de individual/grupal), CONC-01 (test anti-sobrecupo concurrente), CONC-02 (test no-regresión cupo 1).

**Fuera de alcance:** modelo de espacio físico / canchas (Phase 3, ESPACIO-*), waitlist (WAIT-01, v2), re-apertura del lugar al cancelar (CANCEL-REOPEN-01, v2), estrategia Google Calendar para clases grupales (GCAL-GROUP-01, v2).
</domain>

<decisions>
## Implementation Decisions

### Bloque grupal ↔ clase/servicio (CUPOS-01)
- **D-01:** **Capacidad genérica del slot.** El `time_block` solo gana `capacity` (default 1); el campo `label` existente nombra la clase ("Spinning"). El público **sigue eligiendo servicio** como hoy — NO se ata el bloque a un `service_id`. El cupo cuenta **todos** los turnos que caen en ese slot contra `capacity`, sin importar el servicio. Mínimo cambio, máximo reúso del pipeline, cero cambio al flujo de selección de servicio público. (Descarta el modelo "bloque atado a `service_id`/timetable de clases" — más fiel a gyms pero agrega FK + cambia booking y disponibilidad; no se necesita para el MVP.)

### Modelo "agenda como recurso" (mira Phase 3)
- **D-02:** **Capacity sobre el modelo actual.** Se decide el modelo conceptual ahora — agenda = profesional/`time_block` con `capacity` — pero **NO** se crea una abstracción `resource`/`agenda` genérica en esta fase. Phase 3 agrega la tabla de espacios físicos **ENCIMA** sin re-migrar `capacity`. Razón: menor riesgo sobre el core 011/013 que endureció v0.9; Phase 3 sigue siendo recortable. El profesional sigue siendo el eje de la agenda (incluida la sentinela `00000000-...` para "sin profesional"). (Descarta migrar `professionals` a una tabla `resource` genérica ahora — migración grande sobre el core endurecido, más riesgo de regresión.)

### Duración dentro del bloque grupal (CUPOS-03)
- **D-03:** **Duración fija del bloque.** La clase grupal es un bloque con inicio/fin fijos; todos los inscriptos comparten el mismo horario (mismo `date` + `time`). Ocupación = `count(turnos en el slot con status confirmed/pending_payment) < capacity`. Habilita el chequeo atómico **limpio por slot** (no por solapamiento variable). (Descarta "respeta duración del servicio dentro del bloque" — más flexible pero el anti-sobrecupo deja de ser un count limpio por slot.)

### Roster del admin (CUPOS-04)
- **D-04:** **Click en slot grupal → drawer (mobile) / panel (desktop).** Muestra contador (ej. 8/15) + lista de inscriptos con **nombre, contacto y estado** (confirmado / seña pendiente). Reusa el lenguaje visual de `agenda-client.tsx` + componentes shadcn/`@/components/ui` + `vaul` ya presentes — NO introducir librería nueva. (Descarta expand inline en la grilla — recarga visualmente la agenda.)

### Seña (CUPOS-05)
- **D-05:** La seña se configura **por servicio** (pide / no pide), **independiente** de que el bloque sea individual o grupal. No se agrega pricing ni lógica de seña nueva por capacidad — el flag por servicio actual se respeta tal cual en el alta grupal.

### Público (CUPOS-02)
- **D-06:** El público ve el horario "disponible" hasta que `count >= capacity`, momento en que deja de ofrecerse ("lleno"). **NUNCA** expone cuántos lugares quedan (el contador/roster es dato exclusivo del admin). `/api/booking/availability` cuenta por slot vs `capacity`. El público NO debe poder inferir lugares restantes (chequear que la respuesta de availability no filtre el conteo — solo libre/lleno).

### Claude's Discretion (técnico — LOCKED como atómico por roadmap/STATE)
- **Mecanismo atómico anti-sobrecupo (CONC-01):** lock por slot / `SELECT … FOR UPDATE` / transacción serializable / contador con check — la forma exacta la define research/planner. **LOCKED:** chequeo atómico deliberado, **nunca un `count` suelto sin lock**. El re-check JS sigue siendo solo UX; la garantía real es la DB (igual que hoy `slot_taken`).
- **Redefinición de constraints 011/013 a capacity-aware:** `appointments_no_double_booking` (índice único en `business_id, COALESCE(professional_id, sentinela), date, time` WHERE status confirmed/pending_payment) y `appointments_no_overlap` (EXCLUDE gist por `tsrange`) deben pasar a permitir hasta `capacity` filas en el mismo slot **sin** dejar de rechazar la doble-reserva en bloques cupo 1 (CONC-02). Cómo se keya la ocupación (ej. columna `seat`/posición que vuelva único el índice, o reemplazo del índice por el chequeo atómico) es discreción de research/planner.
- **Migración de `capacity`:** aditiva (default 1), RLS habilitada + policies por operación con `with check (business_id = ...)`; la migración no expone capacidad/roster a `anon`. Numeración post-baseline con separador underscore (ej. `041_...`). Validar con `supabase db reset` local antes de prod.
- **Validación de entrada y errores:** mismo estilo defensivo del repo; sumar `slot_full` (409) al mapeo de errores junto a `slot_taken`. Forma `{ ok, error }` snake_case, status coherentes.
- **Reúso del core:** el chequeo atómico + insert vive en `lib/booking-core.ts` (`createAppointmentCore`) reusado por el endpoint público (service-role) y el alta manual autenticada de Phase 1 — ambos caminos heredan el anti-sobrecupo sin duplicarlo.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core de reservas a redefinir (corazón de la fase)
- `lib/booking-core.ts` — Única fuente de verdad de la cadena validación + insert (`createAppointmentCore`). Acá vive hoy el re-check de solapamiento y la traducción `23505`/`23P01` → `slot_taken`; acá entra el chequeo atómico anti-sobrecupo + `slot_full`. Reusado por público y alta manual.
- `app/api/booking/create/route.ts` — Caller público (service-role) del core; mapea el resultado a la respuesta HTTP. Sumar `slot_full`.
- `app/api/appointments/create/route.ts` — Caller del alta manual autenticada (Phase 1); también hereda el anti-sobrecupo.
- `app/api/booking/availability/route.ts` — Cómo se computa disponibilidad (solapamiento, sentinela `00000000-...` para "sin profesional", estados `confirmed`/`pending_payment`). Pasa a contar por slot vs `capacity` (D-06) sin filtrar lugares restantes.

### Constraints de integridad (NO debilitar el cupo 1)
- `supabase/migrations/00000000000000_baseline.sql` — Contiene `appointments_no_double_booking` (índice único, ex-migr. 011) y `appointments_no_overlap` (EXCLUDE gist, ex-migr. 013). Estos son los constraints a redefinir a capacity-aware con cero regresión.
- `supabase/migrations/040_appointments_clients_insert_with_check.sql` — Último estado de policies INSERT WITH CHECK (Phase 1); referencia para la nueva migración de `capacity` (041+).

### Editor de agenda + grilla (CUPOS-01, CUPOS-04)
- `app/(dashboard)/agenda/page.tsx` + `app/(dashboard)/agenda/agenda-client.tsx` — Vista de agenda: carga `time_blocks`, `locations`, `schedule_exceptions`, `appointments` por `business_id`. Acá va el contador + roster (D-04) y el campo "cupo" por bloque (D-01).
- `app/(dashboard)/settings/settings-client.tsx` — Editor de horarios/`time_blocks` (grilla por profesional/consultorio); acá gana el campo `capacity` por bloque.
- `lib/types.ts` — Interfaces de dominio (`time_blocks`, `Appointment`); agregar `capacity` al tipo del bloque.

### Aislamiento por tenant (no negociable)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — Reglas RLS / policies / `business_id` para la migración de `capacity` y cualquier query de roster/availability.
- `lib/supabase/server.ts` — `createClient()` anon-key + RLS (alta manual / dashboard). `lib/supabase/admin.ts` — service-role (booking público).

### Encuadre y planning
- `c:\Users\franc\Desktop\Forjo Studio\forjo-cupos-grupales-brief.md` — Brief de cupos: §2 decisiones LOCKED (C1-C5), §3 desafío anti-sobrecupo concurrente, §4 modelo propuesto, §5 touchpoints, §6 abiertos (resueltos en este CONTEXT), §8 espacio compartido (Phase 3).
- `c:\Users\franc\Desktop\Forjo Studio\forjo-motor-reservas-encuadre.md` — Encuadre del milestone (faseo manual→cupos→espacio).
- `.planning/workstreams/motor-reservas/ROADMAP.md` — Phase 2 goal + success criteria + security/integrity relevance.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — CUPOS-01..05, CONC-01, CONC-02.
- `.planning/workstreams/motor-reservas/phases/01-turnos-manuales/01-CONTEXT.md` — Decisiones de Phase 1 (extracción del core, dedupe, RLS INSERT WITH CHECK) sobre las que construye esta fase.

### Tests (la ingeniería real)
- `.planning/codebase/TESTING.md` — Estado de la suite Vitest (molde TEST-01 de v0.9: aislamiento anon-key + webhooks). CONC-01 (anti-sobrecupo concurrente) y CONC-02 (no-regresión cupo 1) extienden esta suite — son el criterio de éxito duro.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/booking-core.ts` (`createAppointmentCore`):** ya centraliza re-check de solapamiento + insert + traducción de constraint a `slot_taken`. El anti-sobrecupo + `slot_full` se agrega acá una sola vez → ambos callers (público service-role y manual autenticado) lo heredan.
- **Constraints en baseline:** `appointments_no_double_booking` (índice único parcial) y `appointments_no_overlap` (EXCLUDE gist con `tsrange` + `COALESCE(professional_id, sentinela)`) son el respaldo atómico actual a redefinir.
- **`agenda-client.tsx` + `vaul`/shadcn:** drawer mobile / panel desktop ya disponibles para el roster (D-04); no agregar dependencias.
- **`settings-client.tsx`:** editor de `time_blocks` donde entra el campo `capacity` (D-01) — patrón de edición de grilla existente.

### Established Patterns
- Toda query del dashboard filtra por `.eq('business_id', business.id)`; la nueva columna `capacity` y el roster respetan el mismo aislamiento.
- Errores `Response.json({ ok, error }, { status })` snake_case; reusar `slot_taken` (409) y sumar `slot_full` (409).
- Sentinela `00000000-0000-0000-0000-000000000000` para "sin profesional" en el bucket de solapamiento — la redefinición capacity-aware debe preservarla.
- Estados que ocupan lugar: `confirmed` + `pending_payment` (mismo WHERE de los constraints actuales) — el count de ocupación usa los mismos estados.
- Migraciones post-baseline aditivas, numeradas con underscore, validadas con `supabase db reset` local antes de prod.

### Integration Points
- `time_blocks` gana `capacity` → leído por `availability` (count vs capacity), editor de agenda (campo), agenda (contador/roster).
- `lib/booking-core.ts` → chequeo atómico anti-sobrecupo + `slot_full`, consumido por ambos endpoints de creación.
- Migración `capacity` + redefinición de constraints 011/013 (en baseline) → nueva migración 041+ con RLS preservada.
- Suite Vitest → CONC-01 (concurrencia anti-sobrecupo) + CONC-02 (no-regresión cupo 1).

</code_context>

<specifics>
## Specific Ideas

- Caso ancla (brief §1): entrenador de spinning, clase de las 9, cupo 15 — cada persona reserva el mismo horario hasta llenar. El `label` del bloque nombra la clase; el cupo es el número de lugares. El público no ve cuántos quedan, solo "disponible" hasta que se llena.
- El profesional que "da la clase" NO debe bloquear a los inscriptos de su propia clase: la redefinición capacity-aware tiene que permitir N filas en `(business_id, professional_id, date, time)` para ese bloque, manteniendo el rechazo de la doble-reserva donde `capacity = 1`.

</specifics>

<deferred>
## Deferred Ideas

- **Bloque atado a `service_id` (timetable real de clases).** Considerado en D-01; descartado para el MVP a favor de capacidad genérica + `label`. Reconsiderar si los gyms piden un timetable de clases formal (el slot solo acepta esa clase).
- **Abstracción `resource`/`agenda` genérica.** Considerada en D-02; se difiere — Phase 3 introduce el modelo de espacio físico encima del modelo actual sin re-migrar capacity.
- **Estrategia Google Calendar para clases grupales (GCAL-GROUP-01).** v2 — 1 evento con N asistentes vs N eventos; no bloquea el motor.
- **Waitlist (WAIT-01)** y **re-apertura del lugar al cancelar (CANCEL-REOPEN-01).** v2 — el MVP es "disponible hasta llenarse"; al cancelar, el comportamiento de re-apertura se confirma en v2.

</deferred>

---

*Phase: 2-Cupos Grupales*
*Context gathered: 2026-06-26*
