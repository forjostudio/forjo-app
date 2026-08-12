# Phase 15: Modelo de cupo unificado - Context

**Milestone:** v0.27 — Cupo unificado por servicio
**Requirements:** CUPO-06, CUPO-07, CUPO-08
**Discutido:** 2026-08-12

<domain>
## Phase Boundary

Esta fase mueve **dónde vive el número del cupo** y hace **declarables** los tres modos. No agrega
capacidades de reserva y no cambia el **eje de conteo** de ningún modo — v0.26 los dejó correctos y
verificados con tests de carrera contra la DB, y tocarlos acá sería re-abrir trabajo cerrado.

**Entra:** el enum de tres valores, `services.capacity` como fuente única, `time_blocks.capacity`
dejando de decidir, el gate de cambio de modo (R-1), y las **tres** lecturas del cupo alineadas.

**No entra:** el editor de servicio, el badge de modo, la grilla de la agenda y Finanzas mobile —
todo eso es Phase 16. Tampoco entra dropear `time_blocks.capacity` (se conserva la columna).
</domain>

<decisions>
## Implementation Decisions

### D-01 — Cutover, sin fallback transicional *(heredada del milestone)*

`services.capacity` es la única fuente del número desde el día 1. `time_blocks.capacity` deja de
decidir. **No** se escribe regla de precedencia en el RPC y **no** queda deprecación pendiente.

### D-02 — El cutover no afecta a nadie *(medido contra PRODUCCIÓN, 2026-08-11)*

```sql
select count(*), count(*) filter (where capacity is null), max(capacity) from time_blocks;
-- → 19 bloques · 0 sin capacity · cupo_max 1
```

Ningún negocio usa cupo por bloque. Por eso no se construye aviso de re-declaración.

> ⚠ **Método, no anécdota.** El filtro `where capacity > 1` había dado "Success, no rows" y **eso no
> alcanza**: una query que devuelve 0 filas es indistinguible de una que no midió lo que creías
> (tabla vacía, columna mal nombrada). El control de arriba devuelve números distintos de cero y por
> eso sí prueba algo. Misma trampa que la Phase 14 registró con los `DELETE` que salen "Success" sin
> que el trigger corra.

### D-03 — R-1 se cierra bloqueando, no reparando *(heredada del milestone)*

Cambiar `capacity_mode` en un servicio con turnos futuros vivos se **rechaza** en la base con un
código de dominio fijo. Reparar las filas existentes se descartó: puede toparse con turnos que ya se
solapan de forma ahora ilegal, y ahí el EXCLUDE aborta la transacción igual — el dueño queda con un
error peor y sin salida clara.

### D-04 — Backfill: los servicios existentes pasan a `individual`

**Estado real de producción (medido 2026-08-12):**

```sql
select capacity_mode, capacity, count(*) from services group by 1,2 order by 3 desc;
-- → group_class · 1 · 9      (única fila; CERO simultaneous_resource)
```

Los **9** servicios de producción son `group_class` con `capacity = 1`. Pasan todos a `individual`:
el comportamiento es **byte-idéntico** (cupo 1 en los dos casos ⇒ `is_group = false` en los dos) y
corrige el etiquetado falso, que es el defecto que abrió esta fase.

Por qué es seguro: hoy la rama grupal **no lee `services.capacity`** — lee
`COALESCE(MAX(tb.capacity), 1)`. O sea que `services.capacity` en un servicio grupal es un valor
muerto, y los datos lo confirman: los 9 están en 1.

El backfill se escribe por **predicado**, no por lista de ids:
`capacity_mode = 'group_class' AND capacity <= 1 ⇒ 'individual'`. Si entre la escritura de la
migración y su aplicación alguien declarara un grupal de cupo ≥ 2, ese servicio queda como
`group_class` y no se pisa.

### D-05 — ⚠ ORDEN DENTRO DE LA MIGRACIÓN: backfill ANTES del CHECK

El CHECK de D-06 exige `group_class ⇒ capacity >= 2`. Las **9 filas actuales** son
`group_class` con `capacity = 1`, así que **violan el CHECK**. Si el `ALTER TABLE ... ADD CONSTRAINT`
va antes del `UPDATE`, la migración **aborta entera**.

Orden obligatorio, en la misma transacción:

```
1. ALTER TABLE services DROP CONSTRAINT services_capacity_mode_chk   -- el de 2 valores
2. UPDATE services SET capacity_mode = 'individual'
    WHERE capacity_mode = 'group_class' AND capacity <= 1
3. ALTER TABLE services ADD CONSTRAINT ... CHECK (enum de 3)
4. ALTER TABLE services ADD CONSTRAINT ... CHECK (coherencia modo↔cupo, D-06)
5. ALTER COLUMN capacity_mode SET DEFAULT 'individual'
```

### D-06 — `group_class` con cupo 1 queda PROHIBIDO por CHECK

Después del cambio, un `group_class` de cupo 1 es idéntico a un `individual` — mismo `is_group=false`,
mismo EXCLUDE. Dos representaciones del mismo estado es exactamente la ambigüedad que esta fase viene
a eliminar, así que se cierra en la base:

```
individual              ⇒ capacity = 1
group_class             ⇒ capacity >= 2
simultaneous_resource   ⇒ capacity >= 2
```

**Consecuencia para la Phase 16, escrita acá para que no la redescubra:** el editor tiene que **subir
el cupo a 2 automáticamente** cuando el dueño pase de `individual` a grupal o simultáneo, o el
`UPDATE` rebota contra el constraint.

### D-07 — El gate espejo de la 064 NO se re-escopea en esta fase

El gate cross-servicio de la rama grupal (064, CR2-01) exige hoy, además de `is_group = true` +
servicio distinto + solape, que **el servicio de la fila preexistente esté en modo
`simultaneous_resource`**. El comentario justifica ese recorte diciendo que `time_blocks.capacity` es
del bloque, así que con un bloque de cupo 3 *todas* las filas nacen `is_group = true`.

**Esa razón muere con cupo por servicio.** Pero el caso legal que el recorte protege **sobrevive**:
dos servicios **grupales** distintos que declaran cupo ≥ 2 siguen pudiendo coexistir en la misma
agenda y horario. Ampliar el gate no sería "restaurar integridad perdida", sería **cambiar
comportamiento** — y hacerlo en la misma fase donde se mueve la fuente del cupo, sobre el RPC que la
Phase 12 necesitó **dos rondas de review y cinco blockers** para dejar bien, es apilar riesgo.

**Lo que sí hay que hacer: reescribir el comentario.** Su premisa deja de ser cierta en esta fase y
un comentario que miente es peor que ninguno. Queda anotado como candidato a revisión propia.

### D-08 — Las TRES lecturas del cupo cambian juntas

`time_blocks.capacity` lo leen tres lugares, y los propios comentarios del código los declaran
acoplados por diseño:

| Lugar | Rol | Qué dice su comentario |
|---|---|---|
| `book_slot_atomic` (`schema.sql`) | **autoridad atómica** | — |
| `lib/booking-core.ts:186-199` | re-check JS, solo UX | *"MISMO join que book_slot_atomic"* |
| `app/api/booking/availability/route.ts:72-83` | grilla pública | *"consistente con el `COALESCE(MAX(tb.capacity), 1)` del RPC"* |

Separarlos es literalmente cómo se produce el drift: la grilla diría "lleno" por cupo de bloque
mientras el RPC decide por cupo de servicio. **Hoy ese drift sería invisible** porque todo está en 1 —
y esa invisibilidad es lo que lo vuelve peligroso.

### D-09 — CUPO-08 se verifica por instalación, no por comportamiento

**Cero servicios en modo simultáneo en producción** (D-04). Sumado a que el gate solo dispara con
turnos futuros vivos, el rechazo de CUPO-08 **no se va a poder provocar desde la UI en prod**. Misma
situación que el gate de la 067.

- **En prod:** se verifica que la función y el trigger quedaron instalados (`pg_proc.prosrc`,
  `pg_trigger`), no que rechacen.
- **El comportamiento** se prueba contra el Postgres **local** con tests de integración, incluido el
  camino de rechazo.

No perder tiempo intentando provocarlo en producción.

### Claude's Discretion

- Nombre exacto del código de dominio de CUPO-08 (molde: `abono_is_active`, `abono_has_future_turns`,
  `services_block_delete`). Lo único no negociable es que sea **fijo**, **nuevo** y que **no
  interpole datos del negocio** — el texto viaja al navegador (lección T-14-14 / T-13-09).
- Si el gate de cambio de modo va como trigger `BEFORE UPDATE` sobre `services` o dentro de una
  función existente. ⚠ Antes de elegir `BEFORE UPDATE`, verificar contra el write-path real que no
  rompa una escritura legítima — es exactamente el error que el review propuso en la 067 y que habría
  roto todas las bajas de abono en producción.
- Número de migración: **068** (la 067 se aplicó a prod el 2026-08-11).

### Folded Todos

- `todos/pending/2026-07-30-el-cupo-vive-en-dos-lugares-y-falta-el-modo-individual.md` — foldeado
  entero. Es el origen de CUPO-06/07 y de la relación con R-1.
</decisions>

<deferred>
## Noted for Later

- **Re-escopear el gate espejo de la 064** (D-07). Candidato a revisión propia, con su propio
  análisis de qué comportamiento cambia.
- **Dropear `time_blocks.capacity`.** Deja de decidir en esta fase pero la columna se conserva;
  borrarla es una migración destructiva sin beneficio en este ciclo.
- **Cupo por profesional o por sede.** El cupo sigue siendo del servicio.
- Los tres ítems de presentación (badge de modo, ocupación grupal en la grilla, Finanzas mobile) van
  a la **Phase 16**, ya asignados en el ROADMAP.
</deferred>

<canonical_refs>
## Canonical References

### Alcance y criterios
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — CUPO-06/07/08 y el contexto del defecto
- `.planning/workstreams/motor-reservas/ROADMAP.md` §Phase 15 — goal y success criteria

### Precedentes a leer ANTES de codear
- `supabase/migrations/062_service_capacity_mode_overlap.sql` — introduce `capacity_mode`/`capacity`
- `supabase/migrations/063_simultaneous_resource_hardening.sql` — los 4 blockers del code review
- `supabase/migrations/064_agenda_day_lock_and_mirror_gate.sql` — el lock de negocio-día y el gate
  espejo de D-07. **Leer el razonamiento completo, no solo el SQL.**
- `supabase/migrations/065_service_snapshot_and_delete_gate.sql` y
  `067_abono_delete_orphan_gate.sql` — el molde fail-closed de gate en la base para CUPO-08
- `.planning/workstreams/motor-reservas/phases/12-cupo-por-solape-recurso-simult-neo/12-SECURITY.md`
  — el riesgo residual **R-1** que CUPO-08 cierra

### Superficies a tocar
- `supabase/schema.sql` — `services` (`:1113-1116`) y `book_slot_atomic`
- `lib/booking-core.ts:186-199` — re-check JS del cupo
- `app/api/booking/availability/route.ts:72-83` — `capacityFor()`
- `lib/types.ts` — el tipo del modo

### Skills obligatorias
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — toda migración y policy
- `.claude/skills/convenciones-forjo/SKILL.md` — convenciones del repo
</canonical_refs>

<code_context>
## Existing Code Insights

### Estado real, verificado en el código (2026-08-12)

```sql
services.capacity_mode  text DEFAULT 'group_class' NOT NULL
                        CHECK IN ('group_class','simultaneous_resource')
services.capacity       smallint DEFAULT 1 NOT NULL
                        CHECK (capacity >= 1)
```

En `book_slot_atomic`:

```
rama simultánea → v_svc_cap  = COALESCE(services.capacity, 1)   → is_group := (v_svc_cap > 1)
rama grupal     → v_capacity = COALESCE(MAX(tb.capacity), 1)    → is_group := (v_capacity > 1)
                                        ↑ ESTA es la que se va
```

### La landmine central: `is_group` hace doble trabajo

`is_group` significa **dos cosas a la vez**: "cupo > 1" **y** "exenta del EXCLUDE gist 013"
(`041: AND NOT is_group`). Esa ambigüedad es la causa raíz que la migración **064** tuvo que resolver
con el lock de negocio-día, después de que la 063 no alcanzara. Cualquier cambio en cómo se deriva
`is_group` tiene que razonarse contra el EXCLUDE, no solo contra el conteo.

Un recurso de cupo > 1 **debe** nacer `is_group = true` o el 2º turno solapado chocaría con 23P01 y
el recurso nunca se llenaría.

### Consumidores del RPC (los cuatro, cero regresión obligatoria)

booking público · alta manual · generación forward de abonos · canchas.

### Tests

- `test/concurrency.test.ts` — molde de test de carrera con **control negativo** (se vio FALLAR
  contra el lock viejo antes de pasar con el nuevo). Es el estándar de esta fase: las garantías de
  concurrencia se prueban contra Postgres de verdad, no con aserciones de lectura de código.
- `npx vitest run` **completo no es un gate útil** en la máquina del dueño: ~9 tests y 23 suites caen
  por `Test timed out in 5000ms` contra el Supabase local, que tarda 2.16s al root porque hay tres
  stacks levantados. Correr suites puntuales y decir cuáles.
- **NUNCA `npx tsc`** — baja `tsc@2.0.4` del registro, que no es el compilador y siempre sale 0. Usar
  `./node_modules/.bin/tsc --noEmit`.
</code_context>

<security>
## Security / Integrity

**ALTA — `secure-phase` obligatorio.** Toca `book_slot_atomic`, el núcleo anti-doble-booking que
endurecieron v0.9, v0.12 y v0.26, a través de sus cuatro consumidores.

La Phase 12 encontró **5 blockers en dos rondas de code review** sobre este mismo RPC, incluido un
**doble-booking real**. Tratar esta fase como "solo mover de dónde se lee un número" es exactamente el
error que las migraciones 063 y 064 tuvieron que reparar.

CUPO-08 cierra el riesgo residual **R-1**: hoy cambiar `capacity_mode` con turnos ya creados deja
filas `is_group = true` huérfanas, fuera del EXCLUDE gist **y** fuera del gate espejo ⇒ solapes
permanentes que ningún gate detecta.

**Migraciones:** se aplican **a mano** y en orden, nunca por `db push`. Prod **no tiene**
`supabase_migrations.schema_migrations`. El espejado de `supabase/schema.sql` es **quirúrgico**, nunca
`db dump`. Próxima del proyecto: la **068**.
</security>
