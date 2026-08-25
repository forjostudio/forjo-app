# Phase 18: El modelo y la disponibilidad - Context

**Gathered:** 2026-08-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Que una franja horaria pueda declarar **qué servicios** se dan en ella, y que las **dos** superficies
que deciden disponibilidad lo respeten: la que **ofrece** (`/api/booking/availability`) y la que
**acepta** (`booking-core`, el camino del `create`).

**Requisitos:** AGENDA-01, AGENDA-02, AGENDA-03, AGENDA-04.

**No entra:** la UI de configuración (Phase 19), el booking público / landing / onboarding (Phase 20),
y el cruce con multi-staff (D-03 del milestone, fuera del milestone entero).

</domain>

## Implementation Decisions

### D-01 — Tabla puente con la regla del comodín, molde `professional_services`

**0 filas mapeadas para una franja = esa franja sirve para cualquier servicio.** Es el comportamiento
vigente y el estado de **todos** los negocios el día de la migración.

El molde exacto está en el repo, en producción desde v0.25 (migr. **057**), y hay que copiarlo, no
reinventarlo:

- las **tres** FK con `ON DELETE CASCADE`,
- `business_id` en la fila (desnormalizado a propósito: es lo que hace barata la policy de tenant),
- **PK compuesta** sobre el par,
- **índice inverso** para la consulta por servicio,
- RLS con **cuatro policies por operación** — `select`/`delete` con `USING`, `insert` con `WITH CHECK`,
  `update` con **los dos**.

⚠ **`time_blocks.business_id` es NULLABLE** (verificado en el esquema). Eso NO pasa en
`professional_services`, donde todas las FK son `NOT NULL`. Hay que decidir en el plan qué hace la
puente con un bloque sin negocio — y **no asumir** que el molde aplica tal cual.

### D-02 — La cero regresión es POR CONSTRUCCIÓN, no por cuidado

El día de la migración **todos** los negocios tienen 0 filas ⇒ todas las franjas son comodín ⇒ nada
cambia. Misma jugada que `individual` en v0.27: **el estado neutro es el estado actual**. No hay
backfill, no hay aviso de re-declaración, no hay cutover.

**Consecuencia para la verificación:** que la suite pase con 0 filas **no prueba nada** — es el camino
comodín, o sea el de hoy. Los casos que importan son los que tienen filas.

### D-03 — La regla vive en **un helper puro**, nunca reimplementada por consumidor

Molde exacto: `lib/staff-services.ts` (v0.25). Sus reglas, que aplican igual acá:

- funciones **puras**, sin React ni Supabase → usables en client y server, testeables sin DB;
- los inputs son **filas planas**, nunca clientes de datos;
- **el caller resuelve el filtrado por tenant y por `active` ANTES de llamar** (su D-16).

El motivo por el que ese helper existe está escrito en su cabecera y vale palabra por palabra acá:
tres capas necesitaban la misma regla y definirla una vez evita que **deriven en la interpretación**.

### D-04 — La regla se aplica en la disponibilidad **Y en el `create`**

**La disponibilidad decide qué se OFRECE; el `create` decide qué se ACEPTA.**

Sin el backstop, un POST forjado reserva cerámica en el horario de corte y el dueño se entera cuando
llega el cliente. Es exactamente el patrón que el repo ya exige para el tenant —*re-validar toda
entidad que llega del cliente, nunca confiar en el ID*— y exactamente el agujero que este workstream
tiene abierto con `book_slot_atomic` (ver "Noted for Later").

⚠⚠ **CORRECCIÓN (pattern-mapper, 2026-08-24) — esta decisión se escribió sobre una premisa FALSA.**
Yo afirmé que *"`booking-core.ts:201` ya valida que el turno caiga en la ventana de un bloque"*.
**No la valida.** Esa línea es un **comentario histórico sobre el cupo**; en ese archivo **no hay hoy
ninguna validación de `day_of_week` ni de ventana**. El backstop de D-04 es trabajo **nuevo, sin
analog**, y hay que presupuestarlo como tal.

⚠⚠ **Y hay algo peor, que cambia la forma del fix:** `createAppointmentCore` tiene **TRES** llamadores
(verificado):

| Llamador | ¿La regla aplica? |
|---|---|
| `app/api/booking/create/route.ts:158` — booking público | **SÍ** |
| `app/api/appointments/create/route.ts:82` — alta manual del dueño | **NO** (no valida horario a propósito) |
| `lib/abono-generation.ts:196` — generación de abonos | **NO** (su D-06′, razonado en el código) |

Meter la regla adentro del core **sin gatearla** rompería **DOS exenciones deliberadas**, no una.

**El mecanismo correcto ya existe en el mismo archivo:** `requireDeposit` y `autoAssign` son flags
opcionales de `CreateAppointmentInput` (líneas 32-58, defaults 107-109) que hacen exactamente esto —
un comportamiento que solo se activa para el caller que lo pide. **La regla nueva sigue ese molde: un
flag más, default apagado**, y solo el booking público lo enciende.

Eso además invierte el fail-safe hacia el lado seguro: si un caller nuevo aparece y nadie se acuerda de
encender el flag, hereda el comportamiento de hoy en vez de romperse.

**Descartado:** un trigger o constraint en la base. Sería la garantía más fuerte —valdría incluso
contra el agujero de `anon`— pero es un gate nuevo sobre `appointments`, la tabla que sostiene canchas,
abonos, cupos grupales, multi-staff y espacio compartido. Este workstream ya pagó caro cada gate nuevo
ahí (migr. 063, 064, 067, 069 fueron todas correcciones de gates). **Si aparece un motivo fuerte
durante el planning, se discute — pero no se mete de contrabando.**

### D-05 — A `anon` se le expone una **vista acotada**, molde migr. 059

`public_professional_services` es el precedente: vista con owner `postgres`, **solo** las columnas
necesarias, `GRANT ALL` a los tres roles.

⚠ **Y SIN `security_invoker = true`** — está documentado como Pitfall 5 en la 044 y repetido en la 059:
con `security_invoker` la RLS del anónimo aplica adentro de la vista y devuelve **vacío**. Es el error
que este repo ya cometió una vez.

**Descartado:** replicar el `public read` de `time_blocks`. Esa tabla hoy tiene una policy con
`qual: true` para el rol `public` —o sea, `anon` lee la tabla entera— y **eso es justamente lo que la
059 vino a evitar**. Que el precedente exista no lo vuelve el patrón a seguir.

### D-06 — Un servicio sin ninguna franja que lo cubra es **legal**

Se avisa en el panel y se explica al público; **no** se impide en el modelo.

- **Impedirlo sería una invariante entre filas** (`services` × la puente × `time_blocks`), cara de
  mantener, y **bloquearía al dueño a mitad de configurar** — un estado intermedio legítimo.
- **El aviso ya tiene su patrón en el repo:** `/servicios` muestra **"Sin cobertura"** cuando ningún
  profesional hace un servicio (v0.25, D-08). Es el mismo problema en otra dimensión, y se reusa.

**Reparto:** el aviso del panel es **Phase 19**; la explicación al público es **Phase 20**. Esta fase
solo tiene que dejar el dato **computable** desde el helper puro.

### Claude's Discretion

- El nombre de la tabla, de la vista y del helper (respetando el naming del repo).
- Si el filtro se aplica en SQL o en JS sobre filas ya leídas — con una preferencia: el precedente de
  `staff-services` es **JS puro sobre filas planas**, y `availability` ya lee los bloques y filtra en
  JS. La consistencia pesa; la performance con volúmenes reales pesa más si se mide y contradice.
- La forma exacta de los tests del helper, respetando el estándar del workstream (**control negativo**:
  un caso que pasa con y sin la garantía no cuenta).

### Folded Todos

- `2026-08-14-la-agenda-no-sabe-que-servicio-se-da-en-cada-franja` — es el origen de todo el milestone.
  Se cierra cuando cierre v0.28, no con esta fase.

## Noted for Later

**No tocar en esta fase**, pero uno de ellos condiciona una decisión de acá:

- ⚠ **`book_slot_atomic` es ejecutable por `anon`** y saltea la ventana de reserva, el gate de plan y
  el reCAPTCHA, **que viven sólo en el route handler** (severidad **alta**, pre-existente desde la
  migr. 041). **Por eso D-04 pone la regla también en el `create`**: un control que vive sólo donde el
  cliente coopera ya demostró en este repo que no alcanza. Candidato al milestone siguiente.
- El filtro por tenant del gate se esquiva moviendo `services.business_id` (media).
- Dos clases grupales a la misma hora comparten el espacio de `seat` (el índice único no incluye
  `service_id`).
- **El `public read` de `time_blocks` con `qual: true`** — se evaluó y se dejó afuera a propósito: no
  está roto y revisarlo mete en esta fase una auditoría de algo preexistente. Candidato a todo propio.
- Las suites de abono son flaky en paralelo ⇒ **`npx vitest run` completo no sirve hoy como gate**.

## Canonical References

### Precedentes a leer ANTES de codear — los tres, no uno

| Qué | Dónde | Por qué |
|---|---|---|
| La tabla puente | `supabase/migrations/057_*.sql` | FK, PK compuesta, índice inverso, 4 policies |
| La vista acotada | `supabase/migrations/059_*.sql` | Y el Pitfall 5 de `security_invoker` |
| El helper del comodín | `lib/staff-services.ts` | La regla, sus tests y su contrato de pureza |

### El código que cambia

- `app/api/booking/availability/route.ts` — lee `time_blocks` con `.select('start_time, end_time')`
  filtrando por `business_id` + `day_of_week`. **Ya recibe `serviceId`** desde 15-04.
- `lib/booking-core.ts:201` — donde el bloque define el día y la ventana en el camino del `create`.

### Skills obligatorias

- `supabase-multitenant-rls` — tabla nueva, RLS, policy, vista para `anon`.
- `convenciones-forjo` — naming, estructura, manejo de errores.

## Existing Code Insights

### `time_blocks` hoy

`id · business_id (NULLABLE) · day_of_week · start_time · end_time · label · created_at ·
location_id · capacity`

- **`capacity` ya no decide nada** desde la migr. 068 (v0.27). La tabla quedó reducida a declarar
  **cuándo** se atiende — que es lo que libera el lugar para declarar **qué**.
- RLS activa, con 4 policies. Una es **`public read time_blocks`, `qual: true`, rol `public`**.

### El radio de impacto real: 22 consumidores, y la mayoría NO importa

`time_blocks` se lee en **22 archivos**. Los que deciden algo:

| Consumidor | ¿Entra? |
|---|---|
| `app/api/booking/availability/route.ts` | **Sí** — AGENDA-03 |
| `lib/booking-core.ts` | **Sí** — el backstop de D-04 |
| `lib/landing/derive.ts` | Phase 20 |
| `lib/agent-context.ts` (bot de WhatsApp) | **No** — decidido: vive en otro repo, con su HANDOFF |
| `lib/abono-generation.ts` | **No, y está razonado en el código** |

⚠ **La generación de abonos NO gatea por `time_blocks`, a propósito** (su D-06′, escrito en la
cabecera del archivo): el alta manual tampoco chequea horario, así que con la guarda puesta el abono
era **más restrictivo que poner el mismo turno a mano**. Conserva sólo el skip por día cerrado.
**No agregarle la guarda nueva** — sería reintroducir exactamente lo que ese comentario explica que se
sacó.

### La asimetría que esta fase tiene que respetar

El **alta manual** del panel (`app/api/appointments/create`) **no valida horario**. Si la regla nueva
se aplicara ahí, el dueño no podría cargar a mano un turno de cerámica fuera de su franja — que es
justo lo que un dueño hace cuando hace una excepción. **La regla es para el camino público**, no para
el dueño operando su propia agenda. Confirmarlo al planificar.
