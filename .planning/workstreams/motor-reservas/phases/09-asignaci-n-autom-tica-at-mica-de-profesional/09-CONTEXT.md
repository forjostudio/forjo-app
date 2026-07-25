# Phase 9: Asignación automática atómica de profesional - Context

**Gathered:** 2026-07-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Cuando una reserva **no elige profesional** ("cualquiera"), el sistema le asigna uno **libre y capaz** (que sabe hacer el servicio elegido), y esa elección ocurre **DENTRO del RPC atómico `book_slot_atomic`**, en la misma transacción que ya serializa el anti-sobrecupo y la exclusión por espacio compartido — nunca leyendo libres y después insertando (sería una carrera). Entre varios candidatos gana el que **menos turnos tiene ese día** (reparto de carga).

**Backend puro (UI hint: no).** Requisitos: **ASIGN-02, ASIGN-03, ASIGN-04**. La UI del selector "cualquiera" y mostrar el profesional asignado al cliente (ASIGN-01, ASIGN-05) son **Phase 10** — esta fase no toca ninguna superficie de UI.

**Es el punto de mayor riesgo del milestone:** reescribe el corazón anti-doble-booking que endurecieron v0.9 y v0.12 y que hoy sostiene canchas, abonos, cupos grupales y espacio compartido. **secure-phase OBLIGATORIO.**
</domain>

<decisions>
## Implementation Decisions

### Selección y balanceo (discutido)
- **D-01 (desempate):** cuando 2+ profesionales empatan en "menos turnos ese día", gana el de **orden de alta más viejo** (`professionals.created_at` asc, id como tie-break secundario). Es **determinístico** (los tests de concurrencia de ASIGN-03 son reproducibles) y **self-balancing** (el que gana el empate queda +1, así el próximo empate lo gana el otro). Cero estado extra (no round-robin, no aleatorio).
- **D-02 (qué cuenta como carga):** el conteo "menos turnos ese día" = **todos los turnos NO cancelados** del profesional **ese día completo** (00:00–23:59 zona AR), de **cualquier servicio**, **incluyendo** ocurrencias de abono y holds/señas vigentes. Refleja la ocupación real de la persona, no la demanda de un servicio puntual.
- **D-03 (sede en el conteo):** el conteo de carga es **total en TODAS las sedes** (una persona = una sola agenda; no se la sobrecarga si ya está ocupada en otro local). Distinto del filtro de CANDIDATOS, que sí se acota por sede (ver D-07/D-13).

### Atomicidad y concurrencia (discutido)
- **D-04 (alcance del lock):** el advisory lock se amplía a **`(business_id + horario de inicio)`** — serializa toda reserva al mismo instante de inicio del negocio. El volumen de reservas simultáneas exactas por negocio es bajo → serialización despreciable, y la selección de candidatos nunca ve un estado intermedio (correctness-first). Research valida la mecánica exacta del key respetando la regla dura: **no degradar `slot_full` (anti-sobrecupo) ni `slot_taken` (anti-solape cross-espacio)**.

### Locked desde el milestone/roadmap (no re-discutir)
- **D-05:** la selección ocurre **DENTRO de `book_slot_atomic`**, misma transacción `SECURITY DEFINER`; **nunca** leer-libres→insertar.
- **D-06 (anti-tampering):** el conjunto de candidatos se deriva **server-side** del `business_id` (resuelto por slug/sesión) + el mapeo `professional_services` de Phase 8; **nunca** de una lista de IDs que mande el cliente. Un `professionalId` ajeno no puede colarse por la vía "cualquiera".
- **D-07 (candidatos = capaces + sede + activos):** los candidatos son los profesionales **capaces** del servicio (mapeo `professional_services` **o** regla del comodín) + **de la sede de la reserva** (D-13 de Phase 8: sin-sede vale para todas) + **activos**. ⚠ La **regla del comodín** (0 filas = capaz de todo) hoy vive en TS (`lib/staff-services.ts`); acá hay que **replicarla en SQL dentro del RPC con paridad semántica exacta** — es el punto más delicado de correctness del candidato.
- **D-08 (SECURITY DEFINER):** toda query nueva dentro del RPC filtra por `business_id` **explícito** (RLS no protege adentro de una función `SECURITY DEFINER`).
- **D-09 (migración):** la modificación del RPC va en una **migración numerada nueva** (la próxima es **058**; última aplicada en prod = 057), idempotente, `CREATE OR REPLACE FUNCTION`, aplicada **a mano** coordinada con el deploy. Validación local con `supabase db reset`.
- **D-10 (sin disponibilidad):** si ningún profesional capaz tiene ese horario libre → rechazo con **el error de disponibilidad de siempre** (`slot_full`/`slot_taken`); no se asigna a alguien ocupado ni se cae.
- **D-11 (cero regresión):** los 4 caminos que comparten el motor (elegir profesional específico · reservar cancha · generar ocurrencia de abono · llenar cupo grupal) se comportan **exactamente como antes**. Todos entran por `createAppointmentCore` → un cambio de firma o semántica del RPC los afecta a los 4 a la vez.
- **D-12 (secure-phase obligatorio):** el gate verifica **atomicidad bajo concurrencia REAL** (test contra la DB, no lectura de código), **cero regresión** de los 4 caminos, y **aislamiento por tenant** del conjunto de candidatos.

### Claude's Discretion
- Firma exacta del RPC y cómo se pasa la intención "cualquiera" (sentinel `professional_id NULL` u otro marcador) → planner/research.
- Mecánica exacta del key del advisory lock (cómo se hashea `business_id` + timestamp de inicio) → research, respetando D-04.
- Forma de la query SQL de candidatos (LEFT JOIN + NOT EXISTS para el comodín, etc.) → research/planner, respetando la paridad con `lib/staff-services.ts` (D-07).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alcance y criterios de la fase
- `.planning/workstreams/motor-reservas/ROADMAP.md` §"Phase 9" — goal, 5 success criteria, y la nota de Security/Integrity (riesgos a/b/c/d que el secure-phase debe verificar).
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — ASIGN-02, ASIGN-03, ASIGN-04 (ASIGN-01/05 son Phase 10).

### El motor a modificar (núcleo)
- `lib/booking-core.ts` — `createAppointmentCore`, el core compartido por los 4 consumidores; llama al RPC `book_slot_atomic`.
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` y `supabase/migrations/041_time_blocks_capacity_and_seat.sql` — definición/evolución de `book_slot_atomic`, el advisory lock, `slot_full`/`slot_taken` y el conteo de ocupación/seat. La migración 058 hace `CREATE OR REPLACE FUNCTION` sobre esto.
- `supabase/schema.sql` — snapshot vigente del RPC y las constraints 011/013.

### Insumo de Phase 8 (el mapeo)
- `.planning/workstreams/motor-reservas/phases/08-equipo-qu-servicios-hace-cada-profesional/08-CONTEXT.md` — D-13 (sede: candidatos = capaz + sede de la reserva; sin-sede vale para todas) y la semántica del mapeo.
- `lib/staff-services.ts` — implementación TS de la regla del comodín/cobertura; **la query SQL de candidatos del RPC debe tener paridad semántica exacta con este helper** (D-07).
- `.planning/workstreams/motor-reservas/phases/08-equipo-qu-servicios-hace-cada-profesional/08-SECURITY.md` — patrón de aislamiento por tenant de `professional_services`.

### Los 4 consumidores (verificar cero regresión)
- `app/api/booking/create/route.ts` — booking público (incluye canchas).
- `app/api/appointments/create/route.ts` — alta manual autenticada.
- `app/api/abonos/create/route.ts` + `lib/abono-generation.ts` — generación forward de abonos.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/booking-core.ts` (`createAppointmentCore`): único punto de entrada al RPC — el cambio se concentra acá + en la migración; no hay que tocar los 4 route handlers si la firma se mantiene compatible.
- `lib/staff-services.ts`: fuente canónica (TS) de la regla del comodín — a espejar en SQL, no a re-inventar.
- Migr. 041/042: ya traen el `pg_advisory_xact_lock`, el conteo de ocupación y las exclusiones — la asignación se inserta en ese esqueleto, ampliando el lock (D-04) sin romper `slot_full`/`slot_taken`.

### Established Patterns
- Migración numerada + `CREATE OR REPLACE FUNCTION`, idempotente, aplicada a mano a prod (igual que 042/054/057); validación local con `supabase db reset`.
- `SECURITY DEFINER` + filtro `business_id` explícito adentro (RLS no aplica dentro de la función).

### Integration Points / Tests a espejar
- `test/concurrency.test.ts`, `test/booking-core.test.ts`, `test/manual-booking.test.ts`, `test/booking-public-regression.test.ts`, `test/helpers/booking-fixtures.ts` — la suite de atomicidad/regresión del motor. ASIGN-03 (dos "cualquiera" concurrentes → profesionales distintos, nunca sobre-reserva) se testea **contra la DB local** espejando `concurrency.test.ts`; la regresión de los 4 caminos usa las fixtures existentes.
</code_context>

<specifics>
## Specific Ideas

- "Menos turnos ese día" = reparto de carga por **ocupación real de la persona** (día completo, todas las sedes, todos los servicios, incluidos abonos/holds), no por demanda del servicio puntual.
- El desempate self-balancing por orden de alta hace que, con dos profesionales libres, las reservas alternen naturalmente sin necesidad de estado.
</specifics>

<deferred>
## Deferred Ideas

- **UI de "cualquiera" + mostrar el profesional asignado** (ASIGN-01, ASIGN-05): son **Phase 10** (superficie pública + confirmación + mail). Esta fase deja la asignación funcionando server-side; Phase 10 la expone.

### Reviewed Todos (not folded)
- **"Cupo por solape: capacity > 1 no controla turnos escalonados"** (`.planning/workstreams/motor-reservas/todos/pending/2026-07-22-cupo-por-solape-*.md`, score 0.6): toca el **mismo RPC** `book_slot_atomic`, pero es **v0.26** — milestone aparte, diferido a propósito para no meter dos cambios grandes al núcleo en el mismo ciclo. NO entra en Phase 9. Se lo tiene en el radar porque la migración 058 y la de v0.26 tocarán la misma función (coordinar orden).

</deferred>

---

*Phase: 9-Asignación automática atómica de profesional*
*Context gathered: 2026-07-25*
