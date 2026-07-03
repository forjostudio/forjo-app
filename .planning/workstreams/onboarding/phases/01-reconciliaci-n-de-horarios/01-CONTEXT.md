# Phase 1: Reconciliación de horarios - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Unificar la fuente de horarios del negocio en **una sola tabla canónica** para que lo que se carga
en el onboarding llegue al **panel de agenda** y al **booking público**, y que la **landing** y el
**agente de WhatsApp** muestren lo mismo — eliminando la divergencia actual entre `business_hours`
(onboarding + landing + agente) y `time_blocks` (panel + booking).

**Fuera de scope (esta fase):** el rework de UX general del onboarding y el botón "Omitir" formal
en todos los pasos (Phase 2, ONB-01/02). NO se re-toca el motor de agenda/booking (availability /
book_slot_atomic sobre time_blocks). No se agregan capacidades nuevas de agenda.

**Naturaleza del riesgo:** REGRESIÓN, no aislamiento. Los horarios ya viven bajo `business_id`
(RLS). El peligro es romper a alguno de los 4 lectores/escritores o dejar dos fuentes divergentes.
</domain>

<decisions>
## Implementation Decisions

### Fuente canónica (decisión central)
- **D-01:** **`time_blocks` es la fuente ÚNICA canónica de horarios.** Es el modelo operativo sobre
  el que ya está construido el motor v0.12 (availability / book_slot_atomic), más rico
  (N bloques/día → horario partido, `capacity`, `location_id`). `business_hours` (1 ventana/día +
  `is_open`) se **elimina**. El motor NO se toca.

### Cutover de datos (sin backfill)
- **D-02:** **Cutover limpio, SIN migración de datos.** No hay clientes en producción y el usuario
  confirmó que "si queda todo en 0 no hay problema" → NO se hace backfill de `business_hours` →
  `time_blocks`. Los negocios sin `time_blocks` simplemente quedan sin horarios cargados hasta que
  los carguen (onboarding o panel). Esto simplifica la fase: cero script/migración de datos.

### Eliminación de `business_hours`
- **D-03:** Se **DROPEA la tabla `business_hours`** (fold de SCHED-DROP-01 a esta fase, ya que no hay
  data que preservar). Orden obligatorio: **primero migrar los 3 lectores** (D-05) a `time_blocks`,
  **después** el DROP, para no romper nada. Migración numerada nueva (próximo número disponible;
  verificar la secuencia — 045 ya existe en `gsd/motor-reservas` fuera de esta rama, coordinar el
  número al planificar). Verificar con `grep` que ningún path lea `business_hours` antes del DROP.
  Validar con `supabase db reset` local.

### Onboarding pasa a escribir time_blocks (+ horario partido)
- **D-04:** El paso de horarios del onboarding (`app/(onboarding)/onboarding/page.tsx:~209`) deja de
  escribir `business_hours` y pasa a **insertar `time_blocks`** (`business_id`, `day_of_week`,
  `start_time`, `end_time`, `capacity=1`, `location_id=null`; patrón del insert del panel en
  `agenda-client.tsx:~244`). **Permite horario partido**: la UI del paso deja cargar varios bloques
  por día (aprovechando time_blocks). Un día sin bloques = cerrado (no se inserta nada).

### Display en landing / agente
- **D-05:** Los 3 lectores de `business_hours` migran a **leer `time_blocks`** y derivan el horario
  agrupando por `day_of_week` y listando **TODOS los rangos del día** (ej. "Lun 9-12 y 15-19"), no
  colapsando a un solo open/close. Lectores a migrar:
  - `lib/landing/derive.ts` + `components/landing/hours.tsx` (landing pública)
  - `lib/agent-context.ts` + `app/api/agent/context/route.ts` (agente de WhatsApp)
  Días sin `time_blocks` = cerrado en el display.

### Cross-phase (nota para Phase 2)
- **D-06 [informational]:** (NO es una decisión de implementación de Phase 1 — es un forward-reference
  a Phase 2.) El usuario quiere, además del horario partido (D-04), un **botón "Omitir / agregar más
  tarde"** en el paso de horarios del onboarding. El botón "Omitir" formal es **ONB-01 (Phase 2)**;
  en Phase 1 el paso de horarios queda con soporte de time_blocks + split. El skip del paso de
  horarios es el primer candidato natural del rework de Phase 2 — se implementa allá, no acá.

### Claude's Discretion
- UI exacta del paso de horarios con split (botones agregar/quitar bloque) — seguir el patrón del
  panel (`agenda-client.tsx`).
- Formato exacto del string de rangos en landing/agente (separadores, "Cerrado", orden de días).
- Número de la migración del DROP y si va sola o junto a otros cambios de esquema (probablemente sola).
- Si el DROP se hace en esta fase o se deja un `-- deprecated` transitorio (preferencia: DROP, no hay data).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Escritor a migrar
- `app/(onboarding)/onboarding/page.tsx` (~línea 209) — hoy `supabase.from('business_hours').insert(...)`;
  pasa a insertar `time_blocks` con soporte de horario partido (D-04).

### Patrón de escritura de time_blocks (a replicar)
- `app/(dashboard)/agenda/agenda-client.tsx` (~línea 244) — el insert de `time_blocks` del panel
  (shape + cómo maneja varios bloques por día).

### Lectores de business_hours a migrar a time_blocks (D-05)
- `lib/landing/derive.ts` + `components/landing/hours.tsx` — horarios en la landing.
- `lib/agent-context.ts` + `app/api/agent/context/route.ts` — horarios que consume el agente WhatsApp.

### Modelo / esquema
- `lib/types.ts` — `TimeBlock` (day_of_week, start_time, end_time, capacity, location_id, label) y
  `BusinessHour` (day_of_week, open_time, close_time, is_open) — a eliminar.
- `supabase/schema.sql` — DDL de ambas tablas; la migración del DROP se refleja acá + `db reset`.

### Motor (referencia — NO tocar)
- `app/api/booking/availability/route.ts` — cómo el motor lee `time_blocks` (day_of_week + ventana +
  capacity). Confirma que time_blocks es la fuente operativa.

### Roadmap / requirements / skills
- `.planning/workstreams/onboarding/ROADMAP.md` §"Phase 1" — goal, criterios.
- `.planning/workstreams/onboarding/REQUIREMENTS.md` — SCHED-01, SCHED-02 (+ SCHED-DROP-01 folded).
- Skill `supabase-multitenant-rls` — la migración del DROP + RLS de time_blocks (ya por business_id).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `time_blocks` ya tiene RLS por `business_id` y es la fuente del motor → migrar hacia ahí = cero
  cambio al motor, cero RLS nueva. El insert del panel (`agenda-client.tsx`) es el patrón exacto.
- El paso de horarios del onboarding ya recolecta open/close por día — convertir a time_blocks es
  mapear cada día abierto a un bloque (y permitir agregar más bloques para el split).

### Established Patterns
- Migraciones numeradas en `supabase/migrations/*.sql`, aplicadas a mano + validadas con
  `supabase db reset` local (⚠ coordinar el número: `045_landing_cms.sql` existe en `gsd/motor-reservas`,
  fuera de esta rama `gsd/onboarding` — verificar la secuencia real en la rama al planificar).
- Derivar "horario por día" agrupando por `day_of_week` (mismo criterio de dow que el motor).

### Integration Points
- 1 escritor (onboarding) + 3 lectores (landing derive, landing hours component, agent-context) migran.
- 1 migración de esquema: DROP `business_hours` (después de migrar los lectores).
- El panel/booking (time_blocks) NO cambian — ya son la fuente.

### Security / Isolation (relevancia: BAJO — regresión, no aislamiento)
- Sin datos de tenant nuevos; `time_blocks` ya RLS por `business_id`; el onboarding escribe con la
  sesión del owner (business_id propio). El DROP de `business_hours` debe limpiar sus policies/RLS
  sin dejar referencias colgadas. El secure-phase verifica: que ningún lector quede leyendo la tabla
  dropeada, y que la escritura del onboarding respete el aislamiento por business_id.
</code_context>

<specifics>
## Specific Ideas

- Horario partido real: ej. "Lunes 9-12 y 15-19" debe poder cargarse (onboarding) y mostrarse
  (landing/agente) — es la ganancia de usar time_blocks.
- "Todo en 0 no hay problema": no hay clientes → cutover limpio sin migración de datos.
- El motor v0.12 (availability + book_slot_atomic) queda intacto: solo cambia de dónde SALEN los
  horarios que ya consume.
</specifics>

<deferred>
## Deferred Ideas

- **Botón "Omitir" formal en todos los pasos + repaso de flujo** → Phase 2 (ONB-01/02). En Phase 1
  solo el paso de horarios se toca (write a time_blocks + split); el skip general es Phase 2.
- **ONB-PROGRESS-01** (indicador de onboarding incompleto en el panel) — v2.
- Backfill `business_hours`→`time_blocks` — DESCARTADO (no hay data que preservar, D-02).

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 1-Reconciliación de horarios*
*Context gathered: 2026-07-03*
