# Phase 16: Correcciones del gate - Context

**Milestone:** v0.27 — Cupo unificado por servicio
**Requirements:** GATE-01, GATE-02, GATE-03
**Discutido:** 2026-08-16

<domain>
## Phase Boundary

Esta fase toca **un solo predicado**, el `IF EXISTS` que comparten los dos gates de servicio, y lo
corrige en **tres** cosas que salieron de la UAT de la Phase 15 y del audit de seguridad — todas
**después** de que el gate ya estuviera en producción.

**Entra:** la migración **070** con las tres correcciones, sus tests por dirección con control
negativo, el espejado en `schema.sql` y el runbook de aplicación.

**No entra:** nada de superficie. El copy del editor, el badge de modo, la grilla de la agenda y
Finanzas mobile son **Phase 17**. Si te encontrás tocando un `.tsx`, te fuiste de alcance — con una
excepción: si el copy de un rechazo existente deja de ser cierto por el cambio, se corrige acá.
</domain>

<decisions>
## Implementation Decisions

### D-01 — Las tres correcciones van en UNA migración, no en tres

`GATE-01`, `GATE-02` y `GATE-03` viven en el **mismo `IF EXISTS`**. Tocarlo tres veces multiplica el
riesgo sobre una función que ya está en producción y triplica el trabajo de `secure-phase`. Una sola
redefinición, un solo threat model, una sola pasada de auditoría.

### D-02 — GATE-01: el criterio de dirección es `OLD.capacity_mode <> 'individual'`

Un turno nace `is_group = true` **solo si el servicio no era `individual`** al crearse
(`v_is_group := (v_svc_cap > 1)` y el CHECK fija `individual ⇒ capacity = 1`). Y `is_group = true` es
exactamente lo que lo saca del EXCLUDE gist 013 (`041: AND NOT is_group`).

| Dirección | Turnos que ya existen | Decisión |
|---|---|---|
| `individual` → grupal / simultáneo | `is_group = false` ⇒ siguen bajo el EXCLUDE **y** se cuentan contra el cupo nuevo | **pasa** |
| grupal / simultáneo → `individual` | `is_group = true` ⇒ fuera del EXCLUDE, y el gate espejo deja de cubrirlos | **rechaza** — esto ES R-1 |
| grupal ⇄ simultáneo | cambia el **eje de conteo**: un conjunto hoy legal puede volverse ilegal | **rechaza** |

⚠ **Un solo turno futuro alcanza** para abrir el agujero en las direcciones peligrosas. No es cuestión
de cantidad: es que esa fila queda huérfana de todos los guards. El dueño planteó lo contrario durante
la UAT y se evaluó y descartó con este razonamiento — está registrado en `15-UAT.md`.

### D-03 — GATE-02: excluir solo `'cancelled'`

Hoy el predicado usa `status IS NULL OR status NOT IN ('cancelled','completed')`, así que marcar
**`completed`** un turno **futuro** lo saca del `EXISTS` y abre el gate. Es el residual **R-15-A** de
`15-SECURITY.md`. El cierre es excluir únicamente `'cancelled'`.

⚠ **Ojo con el efecto colateral:** el mismo predicado lo usa el gate de **borrado de servicio**
(migr. 065), donde excluir `'completed'` sí tiene sentido — un turno completado es historia y no debe
trabar el borrado. Evaluá si los dos gates necesitan el **mismo** conjunto de estados o si divergen a
propósito, y **dejalo escrito**. No asumas que comparten criterio solo porque comparten forma.

### D-04 — GATE-03: fecha + hora, en los DOS gates

Los dos usan hoy `a."date" >= v_today` — **solo la fecha**:

- `services_block_delete` (migr. **065**, `:255`)
- `services_block_mode_change` (migr. **068**, `:42`)

Un turno de **hoy a hora ya pasada** sigue bloqueando hasta mañana. Es el **mismo bug** que la Phase 13
arregló en la UI —gap **G4**, resuelto con `lib/appointment-time.ts::isPastAppointment`— y que **nunca
cruzó al SQL**: por eso la UI muestra el turno en "Pasados" mientras la base lo cuenta como futuro.

Comparar `(a.date + a.time)` —o el fin del turno, `+ duration_minutes`— contra el `now()` de Argentina.

⚠ **`appointments.time` y `duration_minutes` pueden ser NULL** en filas viejas. La rama defensiva tiene
que **CERRAR** el gate ante NULL, nunca abrirlo — misma lógica que la rama `status IS NULL` que ya
existe, y misma trampa que la 065 ya pagó una vez.

⚠ **Es un cambio permisivo.** Para el borrado de servicio es lo que HIST-01..03 quiso (los turnos
pasados sobreviven por el snapshot). Para el cambio de modo también parece seguro —una fila pasada no
puede recibir un solape futuro— **pero el alta manual está EXENTA de la ventana de reserva**, así que
en teoría se puede crear un turno en el pasado. **Evaluarlo en el threat model, no asumirlo.**

### D-05 — La 070 nace con transacción explícita

`BEGIN;` / `COMMIT;` en el archivo. Es la lección directa del incidente de la 068: su atomicidad
dependía de cómo la aplicara el cliente, y por `psql -f` pelado podía quedar a medias. Ver
`15-RUNBOOK-068.md`.

### D-06 — `secure-phase` obligatorio, y el register tiene que DEMOSTRAR

Se está **estrechando** un gate que cierra el riesgo residual R-1 de v0.26 y que acaba de pasar
auditoría con `SECURED 32/32`. El threat model nuevo no puede limitarse a decir que las direcciones
peligrosas siguen cerradas: tiene que **mostrarlo**, con la evidencia contra el código y contra la base.

### D-07 — Tests por dirección, con control negativo

Molde: `test/capacity-mode-change-gate.test.ts` (assertea `code` **y** `message`, verifica que la fila
sigue viva, trae los dos guards anti-falso-verde) y el estándar A/B del workstream: **instalar el
predicado viejo, ver fallar el caso, restaurar**. Un test que nunca se vio fallar no prueba nada.

Cobertura mínima: **una dirección segura que ahora pasa** (`individual` → grupal con turno futuro),
**las dos peligrosas que siguen rechazando**, **`completed` futuro que ya no abre el gate**, y **un
turno de hoy a hora pasada que ya no bloquea** — en los dos gates.

### D-08 — La 070 NO se aplica a producción dentro de la fase

Se deja el archivo y el runbook. Aplicarla es decisión del dueño. **El orden correcto es código
primero, migración después** — y esta vez el código relevante (el mapeo de los rechazos a copy propia)
ya está en producción desde 15-02, así que la 070 puede ir sola.

### Claude's Discretion

- Si las tres correcciones son un `CREATE OR REPLACE` de las dos funciones, o si conviene extraer el
  predicado a una función auxiliar compartida. ⚠ Compartirlo **obliga** a que los dos gates usen el
  mismo conjunto de estados, y D-03 dice que eso hay que **decidirlo**, no heredarlo.
- El nombre del código de dominio si hace falta uno nuevo. Fijo, nuevo, sin interpolar datos del
  negocio (el texto viaja al navegador — T-14-14 / T-13-09), y verificado que no sea substring de los
  existentes ni al revés.
- Número de migración: **070** (la 069 se aplicó a prod el 2026-08-16).

### Folded Todos

- `todos/pending/2026-08-16-el-gate-de-cambio-de-modo-bloquea-de-mas.md` — foldeado entero. Es el
  origen de GATE-01 y GATE-03, y enlaza R-15-A (GATE-02).
</decisions>

<deferred>
## Noted for Later

- **Toda la superficie** (copy del editor, los tres defectos de la UAT, badge de modo, grilla de la
  agenda, Finanzas mobile) → **Phase 17**, ya asignada en el ROADMAP.
- **Edición inline del cupo en la tarjeta** — capacidad nueva, no entra en este ciclo
  (`todos/pending/2026-08-14-edicion-inline-del-cupo-en-la-tarjeta-de-servicio.md`).
- **Una persona puede ocupar todos los cupos de una clase** — capacidad nueva, superficie anónima,
  `secure-phase` recomendado (`todos/pending/2026-08-16-una-persona-puede-ocupar-todos-los-cupos-de-una-clase.md`).
- **La agenda no sabe qué servicio se da en cada franja** — milestone propio
  (`todos/pending/2026-08-14-la-agenda-no-sabe-que-servicio-se-da-en-cada-franja.md`).
- **T-15-31** (bajar el cupo de un grupal con turnos futuros deja un slot sobre-cupo). El auditor
  corrigió su justificación: "pide una decisión de producto" vale para *rechazar/cancelar*, no para
  **avisar en el editor**, que no fue costeado. Candidato de Phase 17, donde vive el editor.
</deferred>

<canonical_refs>
## Canonical References

### Alcance y criterios
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — GATE-01/02/03
- `.planning/workstreams/motor-reservas/ROADMAP.md` §Phase 16

### De dónde salió cada corrección
- `.planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/15-UAT.md` — GATE-01 y
  GATE-03 salieron de acá, con las palabras del dueño
- `.planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/15-SECURITY.md` — **R-15-A**
  (GATE-02) y el register de 32 amenazas que esta fase no puede reabrir
- `todos/pending/2026-08-16-el-gate-de-cambio-de-modo-bloquea-de-mas.md` — el análisis completo

### Precedentes a leer ANTES de codear
- `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql` — **el gate que se corrige**
- `supabase/migrations/065_service_snapshot_and_delete_gate.sql` — el **otro** gate con el mismo
  predicado de fecha (GATE-03 lo toca también)
- `supabase/migrations/069_shared_capacity_agenda_and_space_gates.sql` — la más reciente; **su header
  razona por qué el recorte del gate espejo es nominal y no numérico**, que es el mismo tipo de error
  que GATE-01 tiene que evitar en el sentido contrario
- `lib/appointment-time.ts::isPastAppointment` — el fix de G4 en la UI que GATE-03 lleva al SQL
- `supabase/migrations/064_agenda_day_lock_and_mirror_gate.sql` — la landmine de `is_group`

### Skills obligatorias
- `.claude/skills/supabase-multitenant-rls/SKILL.md` · `.claude/skills/convenciones-forjo/SKILL.md`
</canonical_refs>

<code_context>
## Existing Code Insights

### El predicado que se corrige, hoy

```sql
v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
...
IF EXISTS (
  SELECT 1 FROM appointments a
   WHERE a."service_id" = OLD."id"
     AND (OLD."business_id" IS NULL OR a."business_id" = OLD."business_id")
     AND a."date" >= v_today                                                   -- ← GATE-03
     AND (a."status" IS NULL OR a."status" NOT IN ('cancelled', 'completed'))  -- ← GATE-02
) THEN RAISE ...
```

Y arriba, el guard de no-cambio que GATE-01 tiene que complementar:

```sql
IF NEW."capacity_mode" IS NOT DISTINCT FROM OLD."capacity_mode" THEN RETURN NEW; END IF;
```

### La landmine, otra vez

`is_group` significa **dos cosas a la vez**: "cupo > 1" **y** "exenta del EXCLUDE gist 013". Post-068
vale `is_group ⟺ capacity_mode <> 'individual'` — el auditor lo **probó**, no lo dedujo: no existe
ningún cambio de solo `capacity` que cruce la frontera 1/2, porque el CHECK de coherencia lo impide.
**Esa equivalencia es lo que hace correcto el criterio de D-02.** Si algo la rompe, GATE-01 deja de ser
seguro.

### Lo que este workstream ya aprendió sobre arreglar gates

**Tres veces entre v0.26 y v0.27 el fix propuesto estaba mal y se salvó porque alguien lo midió antes
de aplicarlo:** el `BEFORE UPDATE` de la 067 (habría roto **todas** las bajas de abono en producción),
el enfoque de WR-B3, y el `capacity >= 2` del review de la 069 (habría reabierto lo que cerró la 064).
**Reproducir antes de arreglar no es ceremonia acá: es lo que evitó tres regresiones.**

### Tests y entorno

- `test/capacity-mode-change-gate.test.ts` — 7/7, el molde del gate contra Postgres real.
- `test/concurrency.test.ts` — 28/28, el molde de carrera con control negativo A/B.
- **`npx vitest run` completo NO es un gate útil** en la máquina del dueño: ~9 tests y 23 suites caen
  por `Test timed out in 5000ms` contra el Supabase local (2.16s al root, 3 stacks levantados). Correr
  suites puntuales y declarar cuáles, con `--testTimeout=30000`.
- **NUNCA `npx tsc`** — baja `tsc@2.0.4`, que no es el compilador y **siempre sale 0**. Usar
  `./node_modules/.bin/tsc --noEmit`.
- Ejecutores **secuenciales sobre `main`, sin worktree** (los planes corren `vitest` y `build`).
- Un `UPDATE`/`DELETE` que no matchea ninguna fila sale **"Success" sin que el trigger corra**: para
  probar un rechazo hay que **forzar la fila en la misma transacción**.
</code_context>

<security>
## Security / Integrity

**ALTA — `secure-phase` obligatorio.** Se estrecha un gate que cierra el riesgo residual **R-1** de
v0.26 y que acaba de pasar auditoría (`SECURED 32/32`, `15-SECURITY.md`).

El threat model tiene que cubrir explícitamente: que las direcciones peligrosas siguen cerradas
(**demostrado**, no argumentado); que GATE-03 es **permisivo** y su interacción con el alta manual,
exenta de la ventana de reserva; y que la rama defensiva ante `time` / `duration_minutes` NULL
**cierra** el gate en vez de abrirlo.

**Migraciones:** a mano y en orden, **nunca `db push`** — prod **no tiene**
`supabase_migrations.schema_migrations` y el proyecto **sí está linkeado**, así que un `db push`
intentaría replayar las 31 desde el baseline (ver
`.planning/todos/pending/2026-08-16-traer-las-migraciones-al-flujo-del-cli-supabase.md`). El espejado
de `supabase/schema.sql` es **quirúrgico**, nunca `db dump`. Próxima del proyecto: la **070**.
</security>
